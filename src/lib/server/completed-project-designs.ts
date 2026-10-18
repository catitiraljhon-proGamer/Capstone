import { MongoServerError, ObjectId, type Db } from "mongodb";
import {
  collections,
  type AuditLogDocument,
  type DesignRequestDocument,
  type DesignVersionDocument,
  type EstimateDocument,
  type ExteriorItemDocument,
  type HouseDesignDocument,
  type ProjectDocument,
  type UserDocument,
} from "@/lib/database/collections";
import {
  formatPeso,
  getExteriorEstimate,
  normalizeSelections,
} from "@/lib/house-design-data";
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

async function createDesignFromProject(db: Db, actor: Pick<SessionUser, "id" | "name" | "role">, project: ProjectDocument) {
  const [estimate, request, customer, exteriorItemDocuments] = await Promise.all([
    project.estimateId
      ? db.collection<EstimateDocument>(collections.estimates).findOne({ _id: project.estimateId })
      : null,
    project.designRequestId
      ? db.collection<DesignRequestDocument>(collections.designRequests).findOne({ _id: project.designRequestId })
      : null,
    db.collection<UserDocument>(collections.users).findOne({ _id: project.customerId }, { projection: { name: 1 } }),
    db.collection<ExteriorItemDocument>(collections.exteriorItems).find({ active: true }).sort({ order: 1 }).toArray(),
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

  // The rate is set so the design's estimate with its default materials equals what the project cost.
  const exteriorItems = exteriorItemDocuments.map(({ item, detail, quantity, quantityByArea, options }) => ({
    item, detail, quantity, quantityByArea, options,
  }));
  const defaultSelections = normalizeSelections(sourceDesign?.defaultSelections, exteriorItems);
  const materialPrices = sourceDesign?.materialPrices ?? [];
  const customItems = sourceDesign?.customItems ?? [];
  const { exteriorTotal } = getExteriorEstimate({ area, rate: 0, materialPrices, customItems }, defaultSelections, exteriorItems);
  const rate = Math.max(0, roundAmount((project.contractPrice - exteriorTotal) / area));

  const now = new Date();
  const document: HouseDesignDocument = {
    _id: new ObjectId(),
    name: await uniqueName(db, `${label} – ${project.reference}`),
    style: sourceDesign?.style ?? "Completed Project",
    ...(sourceDesign?.houseType ? { houseType: sourceDesign.houseType } : {}),
    area,
    rooms,
    rate,
    images: await designImages(db, request, sourceDesign),
    notes: `Built under project ${project.reference} and completed on ${completedAt.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" })}. ${area} sqm, ${rooms}. Contract price ${formatPeso(project.contractPrice)}.`,
    status: "Draft",
    defaultSelections,
    materialPrices,
    customItems,
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
 * Every completed construction project gets a draft house design holding its floor area, design images,
 * and accepted cost estimate, so the Admin can review and publish it as a finished design.
 */
export async function syncCompletedProjectDesigns(db: Db, actor: Pick<SessionUser, "id" | "name" | "role">) {
  const completed = await db.collection<ProjectDocument>(collections.projects)
    .find({ status: "Completed" }).sort({ completedAt: 1, updatedAt: 1 }).limit(500).toArray();
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
