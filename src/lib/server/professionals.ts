import { type ClientSession, type Db, ObjectId } from "mongodb";
import { z } from "zod";
import {
  collections,
  type HouseDesignDocument,
  type ProfessionalDocument,
  type ProfessionalsSeedDocument,
} from "@/lib/database/collections";
import {
  professionalDesignLimit,
  professionalRoles,
  type ManagedProfessional,
  type Professional,
  type ProfessionalDesign,
  type ProfessionalInput,
  type ProfessionalRole,
} from "@/lib/professionals";
import { recordAuditLog } from "@/lib/server/audit";
import { embeddedImageSchema } from "@/lib/server/embedded-images";
import { MaintenanceError } from "@/lib/server/maintenance";
import type { SessionUser } from "@/types/domain";
import startingList from "../../../database/seeds/professionals.json";

const startingProfessionals = startingList as { name: string; role: ProfessionalRole }[];
const seededId = "professionals-seeded";
const professionalsCollection = (db: Db) => db.collection<ProfessionalDocument>(collections.professionals);
const designsCollection = (db: Db) => db.collection<HouseDesignDocument>(collections.houseDesigns);

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/, "Choose a team member from the list.");

const profileSchema = z.object({
  name: z.string().trim()
    .min(3, "Enter the full name.")
    .max(80, "Keep the name under 80 characters."),
  role: z.enum(professionalRoles, { error: "Choose a profession from the list." }),
  specialization: z.string().trim().max(80, "Keep the specialization under 80 characters."),
  licenseNumber: z.string().trim().regex(/^\d{0,10}$/, "Enter the PRC license number using digits only, up to 10."),
  yearsOfExperience: z.number({ error: "Enter the years of experience as a number." })
    .int("Enter whole years of experience.")
    .min(0, "Years of experience cannot be negative.")
    .max(70, "Years of experience can be at most 70.")
    .nullable(),
  bio: z.string().trim().max(600, "Keep the short bio under 600 characters."),
  photo: z.string().refine(
    (value) => value === "" || embeddedImageSchema.safeParse(value).success,
    "Upload a JPG, PNG, or WebP photo.",
  ),
  visible: z.boolean(),
}).strict();

const changesSchema = profileSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, "Change at least one detail.");

const orderSchema = z.object({ ids: z.array(objectIdSchema).max(500) }).strict();

const fieldLabels: Record<keyof ProfessionalInput, string> = {
  name: "Name",
  role: "Profession",
  specialization: "Specialization",
  licenseNumber: "PRC license number",
  yearsOfExperience: "Years of experience",
  bio: "Short bio",
  photo: "Photo",
  visible: "Shown on About Us",
};

function requireAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change the team.", 403);
}

/**
 * The first read adds the starting team once. After that the Admin's list is kept as it is,
 * even when every person was removed.
 */
async function addStartingProfessionals(db: Db) {
  const marker = await db.collection<ProfessionalsSeedDocument>(collections.systemSettings)
    .updateOne({ _id: seededId }, { $setOnInsert: { seededAt: new Date() } }, { upsert: true });
  if (!marker.upsertedCount || (await professionalsCollection(db).estimatedDocumentCount()) > 0) return;
  const now = new Date();
  await professionalsCollection(db).insertMany(startingProfessionals.map(({ name, role }, order) => ({
    _id: new ObjectId(),
    name,
    role,
    specialization: "",
    licenseNumber: "",
    yearsOfExperience: null,
    bio: "",
    photo: "",
    visible: true,
    order,
    createdAt: now,
    updatedAt: now,
  })));
}

/** How many Published designs name each person under Designed By. */
async function publishedDesignCounts(db: Db, ids: ObjectId[]) {
  const counts = await designsCollection(db)
    .aggregate<{ _id: ObjectId; count: number }>([
      { $match: { status: "Published", designedBy: { $in: ids } } },
      { $group: { _id: "$designedBy", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(counts.map((entry) => [entry._id.toHexString(), entry.count]));
}

/** The people in the Admin's order, each with their number of Published designs. */
async function readDocuments(db: Db, { includeHidden }: { includeHidden: boolean }) {
  await addStartingProfessionals(db);
  const documents = await professionalsCollection(db)
    .find(includeHidden ? {} : { visible: true })
    .sort({ order: 1, createdAt: 1 })
    .toArray();
  const counts = await publishedDesignCounts(db, documents.map((document) => document._id));
  return documents.map((document) => ({ document, designCount: counts.get(document._id.toHexString()) ?? 0 }));
}

function toProfessional(document: ProfessionalDocument, designCount: number): Professional {
  return {
    id: document._id.toHexString(),
    name: document.name,
    role: document.role,
    specialization: document.specialization,
    licenseNumber: document.licenseNumber,
    yearsOfExperience: document.yearsOfExperience,
    bio: document.bio,
    photo: document.photo,
    designCount,
  };
}

async function readProfessionals(db: Db): Promise<ManagedProfessional[]> {
  return (await readDocuments(db, { includeHidden: true }))
    .map(({ document, designCount }) => ({ ...toProfessional(document, designCount), visible: document.visible }));
}

/** What the About Us page lists: the people the Admin shows, in the Admin's order. */
export async function getAboutUsProfessionals(db: Db): Promise<Professional[]> {
  return (await readDocuments(db, { includeHidden: false })).map(({ document, designCount }) => toProfessional(document, designCount));
}

/** Everyone in the Admin's order, hidden people included, for the Billing Clerk to name a billing's approver. */
export async function getTeamMembers(db: Db) {
  return (await readDocuments(db, { includeHidden: true }))
    .map(({ document }) => ({ id: document._id.toHexString(), name: document.name, role: document.role }));
}

/** The person named as a billing's approver; null when they were removed from the team. */
export async function findTeamMember(db: Db, id: ObjectId, session?: ClientSession) {
  return professionalsCollection(db).findOne({ _id: id }, { session });
}

/** Everyone, hidden people included, for Maintenance and the Designed By list in House Design. */
export async function getManagedProfessionals(db: Db, actor: SessionUser) {
  requireAdmin(actor);
  return readProfessionals(db);
}

async function findProfessional(db: Db, rawId: unknown) {
  const id = objectIdSchema.safeParse(rawId);
  const document = id.success ? await professionalsCollection(db).findOne({ _id: new ObjectId(id.data) }) : null;
  if (!document) throw new MaintenanceError("This team member was removed. Reload the page.", 404);
  return document;
}

export async function createProfessional(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  requireAdmin(actor);
  const input = profileSchema.parse(raw);
  const last = await professionalsCollection(db).find({}, { projection: { order: 1 } }).sort({ order: -1 }).limit(1).next();
  const document: ProfessionalDocument = {
    _id: new ObjectId(),
    ...input,
    order: (last?.order ?? -1) + 1,
    createdAt: now,
    updatedAt: now,
  };
  await professionalsCollection(db).insertOne(document);
  await recordAuditLog({
    db, actor, action: "Added a team member", entityType: "Professional", entityId: document._id, createdAt: now,
    details: { Name: document.name, Profession: document.role },
  });
  return readProfessionals(db);
}

export async function updateProfessional(db: Db, actor: SessionUser, rawId: unknown, raw: unknown, now = new Date()) {
  requireAdmin(actor);
  const current = await findProfessional(db, rawId);
  const changes = changesSchema.parse(raw);
  const changed = (Object.keys(changes) as (keyof ProfessionalInput)[]).filter((key) => changes[key] !== current[key]);
  if (changed.length) {
    await professionalsCollection(db).updateOne({ _id: current._id }, { $set: { ...changes, updatedAt: now } });
    await recordAuditLog({
      db, actor, action: "Updated a team member", entityType: "Professional", entityId: current._id, createdAt: now,
      details: { Name: changes.name ?? current.name, Changed: changed.map((key) => fieldLabels[key]).join(", ") },
    });
  }
  return readProfessionals(db);
}

/** Removes the person; their designs stay, without anyone under Designed By. */
export async function removeProfessional(db: Db, actor: SessionUser, rawId: unknown, now = new Date()) {
  requireAdmin(actor);
  const current = await findProfessional(db, rawId);
  await professionalsCollection(db).deleteOne({ _id: current._id });
  await designsCollection(db).updateMany({ designedBy: current._id }, { $unset: { designedBy: "" } });
  await recordAuditLog({
    db, actor, action: "Removed a team member", entityType: "Professional", entityId: current._id, createdAt: now,
    details: { Name: current.name, Profession: current.role },
  });
  return readProfessionals(db);
}

/** Saves the order shown on the About Us page; `ids` must list every person once. */
export async function reorderProfessionals(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  requireAdmin(actor);
  const { ids } = orderSchema.parse(raw);
  const existing = await professionalsCollection(db).find({}, { projection: { order: 1 } }).sort({ order: 1, createdAt: 1 }).toArray();
  const existingIds = existing.map((document) => document._id.toHexString());
  if (ids.length !== existingIds.length || new Set(ids).size !== ids.length || ids.some((id) => !existingIds.includes(id))) {
    throw new MaintenanceError("The list changed in the meantime. Reload the page and try again.", 409);
  }
  if (ids.join() !== existingIds.join()) {
    await professionalsCollection(db).bulkWrite(ids.map((id, order) => ({
      updateOne: { filter: { _id: new ObjectId(id) }, update: { $set: { order, updatedAt: now } } },
    })));
    await recordAuditLog({ db, actor, action: "Reordered the team", entityType: "Professional", createdAt: now });
  }
  return readProfessionals(db);
}

/** The newest Published designs credited to a person shown on About Us, one cover photo each. */
export async function getProfessionalDesigns(db: Db, rawId: unknown): Promise<ProfessionalDesign[]> {
  const professional = await findProfessional(db, rawId);
  if (!professional.visible) throw new MaintenanceError("This team member was removed. Reload the page.", 404);
  const designs = await designsCollection(db)
    .find(
      { status: "Published", designedBy: professional._id, "images.0": { $exists: true } },
      { projection: { name: 1, images: { $slice: 1 } } },
    )
    .sort({ createdAt: -1 })
    .limit(professionalDesignLimit)
    .toArray();
  return designs.map((design) => ({ designId: design._id.toHexString(), name: design.name, image: design.images[0] }));
}

/** The person a house design is credited to; throws when the id does not name anyone in the list. */
export async function requireProfessionalId(db: Db, rawId: string) {
  const document = await findProfessional(db, rawId).catch(() => null);
  if (!document) throw new MaintenanceError("The chosen team member was removed. Choose another one under Designed By.");
  return document._id;
}
