import type { Db } from "mongodb";
import { z } from "zod";
import { aboutUsLimits, aboutUsServiceCount, defaultAboutUs, type AboutUsContent, type AboutUsView } from "@/lib/about-us";
import { collections, type AboutUsDocument } from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import { MaintenanceError } from "@/lib/server/maintenance";
import type { SessionUser } from "@/types/domain";

const aboutUsId = "about-us";
const aboutUsCollection = (db: Db) => db.collection<AboutUsDocument>(collections.systemSettings);

const contentSchema = z.object({
  tagline: z.string().trim().min(1, "Enter the tagline.").max(aboutUsLimits.tagline, `Keep the tagline under ${aboutUsLimits.tagline} characters.`),
  intro: z.string().trim().min(20, "Write at least one sentence for the introduction.")
    .max(aboutUsLimits.intro, `Keep the introduction under ${aboutUsLimits.intro.toLocaleString("en-PH")} characters.`),
  services: z.array(z.object({
    title: z.string().trim().min(2, "Enter a title for each What We Do item.")
      .max(aboutUsLimits.serviceTitle, `Keep each What We Do title under ${aboutUsLimits.serviceTitle} characters.`),
    text: z.string().trim().min(10, "Describe each What We Do item in a sentence.")
      .max(aboutUsLimits.serviceText, `Keep each What We Do description under ${aboutUsLimits.serviceText} characters.`),
  }).strict()).length(aboutUsServiceCount, `Keep exactly ${aboutUsServiceCount} What We Do items.`),
}).strict();

/** The saved text, or the built-in text when nothing was saved or the saved text no longer passes the rules. */
export async function getAboutUsContent(db: Db): Promise<AboutUsContent> {
  return (await readAboutUs(db)).content;
}

async function readAboutUs(db: Db) {
  const saved = await aboutUsCollection(db).findOne({ _id: aboutUsId });
  const content = contentSchema.safeParse(saved?.content);
  return { saved: content.success ? saved : null, content: content.success ? content.data : defaultAboutUs };
}

export async function getAboutUsView(db: Db, actor: SessionUser): Promise<AboutUsView> {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change the About Us page.", 403);
  const { saved, content } = await readAboutUs(db);
  return { content, changedBy: saved?.changedBy ?? null, changedAt: saved?.updatedAt.toISOString() ?? null };
}

/** Saves the page text and audits which parts changed. */
export async function updateAboutUsContent(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change the About Us page.", 403);
  const content = contentSchema.parse(raw);
  const { content: current } = await readAboutUs(db);
  const changed = [
    content.tagline !== current.tagline ? "Tagline" : "",
    content.intro !== current.intro ? "Introduction" : "",
    ...content.services.map((service, index) =>
      service.title !== current.services[index].title || service.text !== current.services[index].text ? `What We Do item ${index + 1}` : ""),
  ].filter(Boolean);
  if (!changed.length) return getAboutUsView(db, actor);

  await aboutUsCollection(db).updateOne(
    { _id: aboutUsId },
    { $set: { content, changedBy: actor.name, updatedAt: now } },
    { upsert: true },
  );
  await recordAuditLog({
    db, actor, action: "Updated the About Us page", entityType: "System", createdAt: now,
    details: { Changed: changed.join(", ") },
  });
  return getAboutUsView(db, actor);
}
