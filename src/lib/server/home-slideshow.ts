import { type Db, ObjectId } from "mongodb";
import { z } from "zod";
import { collections, type HomeSlideshowDocument, type HouseDesignDocument } from "@/lib/database/collections";
import { homeSlideshowLimit, type HomeSlide, type HomeSlideshowView } from "@/lib/home-slideshow";
import { recordAuditLog } from "@/lib/server/audit";
import { MaintenanceError } from "@/lib/server/maintenance";
import type { SessionUser } from "@/types/domain";

const slideshowId = "home-slideshow";
const slideshowCollection = (db: Db) => db.collection<HomeSlideshowDocument>(collections.systemSettings);

/** Published designs with a photo, newest first, each as its cover photo. */
async function publishedSlides(db: Db): Promise<HomeSlide[]> {
  const designs = await db.collection<HouseDesignDocument>(collections.houseDesigns)
    .find({ status: "Published", "images.0": { $exists: true } }, { projection: { name: 1, images: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  return designs.map((design) => ({ designId: design._id.toHexString(), name: design.name, image: design.images[0] }));
}

async function readSlideshow(db: Db) {
  const [saved, published] = await Promise.all([slideshowCollection(db).findOne({ _id: slideshowId }), publishedSlides(db)]);
  const byId = new Map(published.map((slide) => [slide.designId, slide]));
  // A picked design that was unpublished (or lost its photos) drops out by itself.
  const chosen = (saved?.designIds ?? []).flatMap((id) => byId.get(id.toHexString()) ?? []);
  return { saved, published, byId, chosen };
}

/** What the home page shows: the Admin's picks in their order, or the newest Published designs when none are picked. */
export async function getHomeSlides(db: Db): Promise<HomeSlide[]> {
  const { published, chosen } = await readSlideshow(db);
  return chosen.length ? chosen : published.slice(0, homeSlideshowLimit);
}

export async function getHomeSlideshowView(db: Db): Promise<HomeSlideshowView> {
  const { saved, published, chosen } = await readSlideshow(db);
  return {
    chosen: chosen.map((slide) => slide.designId),
    designs: published,
    changedBy: saved?.changedBy ?? null,
    changedAt: saved?.updatedAt.toISOString() ?? null,
  };
}

const slideshowSchema = z.object({
  designIds: z.array(z.string().regex(/^[a-f0-9]{24}$/, "Choose designs from the list."))
    .max(homeSlideshowLimit, `Choose up to ${homeSlideshowLimit} designs.`)
    .refine((ids) => new Set(ids).size === ids.length, "Each design can appear only once."),
}).strict();

const slideNames = (slides: HomeSlide[]) => (slides.length ? slides.map((slide) => slide.name).join(", ") : "Newest published designs");

/** Saves the picked designs in order (an empty list goes back to the newest Published designs) and audits the change. */
export async function updateHomeSlideshow(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change the home page slideshow.", 403);
  const { designIds } = slideshowSchema.parse(raw);
  const { byId, chosen } = await readSlideshow(db);
  const picked = designIds.flatMap((id) => byId.get(id) ?? []);
  if (picked.length !== designIds.length) {
    throw new MaintenanceError("A chosen design is no longer published or has no photo. Reload the page and choose again.");
  }
  if (picked.map((slide) => slide.designId).join() === chosen.map((slide) => slide.designId).join()) return getHomeSlideshowView(db);

  await slideshowCollection(db).updateOne(
    { _id: slideshowId },
    { $set: { designIds: designIds.map((id) => new ObjectId(id)), changedBy: actor.name, updatedAt: now } },
    { upsert: true },
  );
  await recordAuditLog({
    db, actor, action: "Updated home page slideshow", entityType: "System", createdAt: now,
    details: { Slideshow: `${slideNames(chosen)} → ${slideNames(picked)}` },
  });
  return getHomeSlideshowView(db);
}
