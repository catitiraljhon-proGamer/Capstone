import { MongoServerError, ObjectId, type Db } from "mongodb";
import {
  collections,
  type AuditLogDocument,
  type DesignRequestDocument,
  type DesignVersionDocument,
  type EstimateDocument,
  type HouseDesignDocument,
  type ProjectDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { formatPeso } from "@/lib/house-design-data";
import { listHouseTypes } from "@/lib/server/house-designs";
import type { SessionUser } from "@/types/domain";

const maxImages = 6;
/** Matches the per-image limit in houseDesignInputSchema so the design can be edited and saved later. */
const maxImageLength = 2_100_000;
const constructionSuffix = / – Construction$/;

const roundAmount = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** The approved design round, else the latest one, else legacy delivered images, else the chosen design's photos. */
async function designImages(db: Db, request: DesignRequestDocument | null, sourceDesign: HouseDesignDocument | null) {
  const versions = request
    ? await db.collection<DesignVersionDocument>(collections.designVersions)
      .find({ designRequestId: request._id }).sort({ version: -1 }).toArray()
    : [];
  const version = versions.find((item) => item.response?.decision === "approved") ?? versions[0];
  const candidates = [
    version?.images,
    request?.completedDesignImages ?? (request?.completedDesignImage ? [request.completedDesignImage] : undefined),
    sourceDesign?.images,
    request?.inspirationImages ?? (request?.inspirationImage ? [request.inspirationImage] : undefined),
  ];
  for (const images of candidates) {
    const usable = (images ?? []).filter((image) => image.length <= maxImageLength).slice(0, maxImages);
    if (usable.length) return usable;
  }
  return [];
}

/** A name not yet used by another design; names are unique. */
async function uniqueName(db: Db, base: string) {
  const designs = db.collection<HouseDesignDocument>(collections.houseDesigns);
  const trimmed = base.slice(0, 110);
  for (let attempt = 1; attempt < 50; attempt += 1) {
    const name = attempt === 1 ? trimmed : `${trimmed} (${attempt})`;
    if (!(await designs.findOne({ name }, { projection: { _id: 1 } }))) return name;
  }
  return `${trimmed} ${new ObjectId().toHexString().slice(-6)}`;
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Design names are unique regardless of letter case, matching the house design form. */
export async function houseDesignNameTaken(db: Db, name: string) {
  return Boolean(await db.collection<HouseDesignDocument>(collections.houseDesigns).findOne(
    { name: { $regex: `^${escapeRegex(name.trim())}$`, $options: "i" } },
    { projection: { _id: 1 } },
  ));
}

/** What the Admin chose when marking the project completed. */
type DesignChoice = { name?: string; houseType?: string };

async function createDesignFromProject(
  db: Db,
  actor: Pick<SessionUser, "id" | "name" | "role">,
  project: ProjectDocument,
  choice: DesignChoice = {},
) {
  const [estimate, request, customer] = await Promise.all([
    project.estimateId
      ? db.collection<EstimateDocument>(collections.estimates).findOne({ _id: project.estimateId })
      : null,
    project.designRequestId
      ? db.collection<DesignRequestDocument>(collections.designRequests).findOne({ _id: project.designRequestId })
      : null,
    db.collection<UserDocument>(collections.users).findOne({ _id: project.customerId }, { projection: { name: 1 } }),
  ]);
  const sourceDesignId = project.houseDesignId ?? request?.houseDesignId;
  const sourceDesign = sourceDesignId
    ? await db.collection<HouseDesignDocument>(collections.houseDesigns).findOne({ _id: sourceDesignId })
    : null;

  const area = request?.floorArea ?? sourceDesign?.area ?? 0;
  if (area <= 0) return null;
  const rooms = request?.rooms || sourceDesign?.rooms || "Not specified";
  const label = project.name.replace(constructionSuffix, "") || "Completed project";
  const completedAt = project.completedAt ?? project.updatedAt;
  const houseType = choice.houseType ?? request?.houseType ?? sourceDesign?.houseType;
  // The finish the customer chose in a custom request, else the finish of the published design they requested.
  const finish = (request?.selectedDesign ? request.selectedDesign.finish : request?.finish) ?? sourceDesign?.finish;

  // The rate is set so the design's estimate equals what the project cost.
  const rate = Math.max(0, roundAmount(project.contractPrice / area));

  const now = new Date();
  const document: HouseDesignDocument = {
    _id: new ObjectId(),
    name: await uniqueName(db, choice.name?.trim() || `${label} – ${project.reference}`),
    style: sourceDesign?.style ?? "Completed Project",
    // Filed under the Admin's choice, else the house type the customer chose, else the chosen design's type.
    ...(houseType ? { houseType } : {}),
    ...(finish ? { finish } : {}),
    area,
    rooms,
    rate,
    images: await designImages(db, request, sourceDesign),
    notes: `Built under project ${project.reference} and completed on ${completedAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" })}. ${area} sqm, ${rooms}. Contract price ${formatPeso(project.contractPrice)}.`,
    status: "Draft",
    sourceProject: {
      projectId: project._id,
      projectReference: project.reference,
      ...(estimate ? { estimateReference: estimate.reference } : {}),
      customerName: customer?.name ?? "Unknown customer",
      contractPrice: project.contractPrice,
      subtotal: project.subtotal ?? estimate?.subtotal ?? project.contractPrice,
      completedAt,
      lineItems: estimate?.lineItems ?? [],
    },
    createdAt: now,
    createdBy: new ObjectId(actor.id),
    createdByName: actor.name,
    updatedAt: now,
  };

  try {
    await db.collection<HouseDesignDocument>(collections.houseDesigns).insertOne(document);
  } catch (error) {
    // Another request already created the design for this project.
    if (error instanceof MongoServerError && error.code === 11000) return null;
    throw error;
  }
  await db.collection<AuditLogDocument>(collections.auditLogs).insertOne({
    _id: new ObjectId(),
    actorId: new ObjectId(actor.id),
    actorName: actor.name,
    actorRole: actor.role,
    action: "house-design.created-from-project",
    entityType: "house_design",
    entityId: document._id,
    details: { name: document.name, project: project.reference },
    createdAt: now,
  });
  return document;
}

/**
 * Designs from projects completed before the Admin chose a house type are filed under the type the customer
 * requested (or the type of the design they picked), when that type is still offered. The rest stay without a type.
 */
async function fileUntypedProjectDesigns(db: Db) {
  const designs = db.collection<HouseDesignDocument>(collections.houseDesigns);
  const untyped = await designs
    .find({ "sourceProject.projectId": { $exists: true }, houseType: { $exists: false } }, { projection: { sourceProject: 1 } })
    .limit(500).toArray();
  if (!untyped.length) return;
  const offered = new Set((await listHouseTypes(db)).map((houseType) => houseType.heading));
  for (const design of untyped) {
    const project = await db.collection<ProjectDocument>(collections.projects)
      .findOne({ _id: design.sourceProject!.projectId }, { projection: { designRequestId: 1, houseDesignId: 1 } });
    const request = project?.designRequestId
      ? await db.collection<DesignRequestDocument>(collections.designRequests)
        .findOne({ _id: project.designRequestId }, { projection: { houseType: 1, houseDesignId: 1 } })
      : null;
    const sourceDesignId = project?.houseDesignId ?? request?.houseDesignId;
    const sourceDesign = sourceDesignId ? await designs.findOne({ _id: sourceDesignId }, { projection: { houseType: 1 } }) : null;
    const houseType = [request?.houseType, sourceDesign?.houseType].find((type) => type && offered.has(type));
    if (houseType) await designs.updateOne({ _id: design._id, houseType: { $exists: false } }, { $set: { houseType } });
  }
}

/**
 * Every completed construction project gets a draft house design holding its floor area, design images,
 * and accepted cost estimate, filed under its house type so the Admin can review and publish it as a finished
 * design. Projects whose design was removed are skipped.
 */
export async function syncCompletedProjectDesigns(db: Db, actor: Pick<SessionUser, "id" | "name" | "role">) {
  await fileUntypedProjectDesigns(db);
  const completed = await db.collection<ProjectDocument>(collections.projects)
    .find({ status: "Completed", completedDesignRemovedAt: { $exists: false } })
    .sort({ completedAt: 1, updatedAt: 1 }).limit(500).toArray();
  if (!completed.length) return [];
  const linked = await db.collection<HouseDesignDocument>(collections.houseDesigns)
    .find({ "sourceProject.projectId": { $in: completed.map((project) => project._id) } }, { projection: { "sourceProject.projectId": 1 } })
    .toArray();
  const linkedIds = new Set(linked.map((design) => design.sourceProject!.projectId.toHexString()));
  const created: HouseDesignDocument[] = [];
  for (const project of completed) {
    if (linkedIds.has(project._id.toHexString())) continue;
    const design = await createDesignFromProject(db, actor, project);
    if (design) created.push(design);
  }
  return created;
}

/** Saves the house design for a project the Admin just marked completed, with the name and type they chose. */
export async function saveCompletedProjectDesign(
  db: Db,
  actor: Pick<SessionUser, "id" | "name" | "role">,
  projectId: ObjectId,
  choice: DesignChoice,
) {
  const project = await db.collection<ProjectDocument>(collections.projects).findOne({ _id: projectId, status: "Completed" });
  if (!project) return null;
  const existing = await db.collection<HouseDesignDocument>(collections.houseDesigns)
    .findOne({ "sourceProject.projectId": projectId }, { projection: { _id: 1 } });
  return existing ? null : createDesignFromProject(db, actor, project, choice);
}
