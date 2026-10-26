import { randomUUID } from "node:crypto";
import { MongoServerError, ObjectId, type ClientSession, type Db } from "mongodb";
import { z } from "zod";
import {
  collections,
  type DesignRequestDocument,
  type EstimateDocument,
  type EstimateLineItemDocument,
  type InvoiceDocument,
  type NotificationDocument,
  type ProjectDocument,
  type ProjectMilestoneDocument,
  type ScheduleDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { fromCentavos, manilaDate, toCentavos } from "@/lib/billing";
import {
  MIN_DOWNPAYMENT_PERCENT,
  buildPaymentSchedule,
  estimateTotals,
  lineAmount,
  scheduleTemplateError,
} from "@/lib/construction";
import { BillingError, audit, autoIssueDownpayment, billingTransaction, nextReference } from "@/lib/server/billing";
import { houseDesignNameTaken, saveCompletedProjectDesign } from "@/lib/server/completed-project-designs";
import { isActiveHouseType } from "@/lib/server/house-designs";
import { customerDesignDto, designWorkflow } from "@/lib/server/design-requests";
import { getSystemSettings } from "@/lib/server/maintenance";
import { findMaterials } from "@/lib/server/materials";
import { materialNameKey, materialNameMax } from "@/lib/materials";
import { insertNotifications } from "@/lib/server/notifications";
import { loadProjectBilling, milestoneDtos, promoteScheduledProjects } from "@/lib/server/project-milestones";
import { addressDetailsSchema, formatAddress } from "@/lib/server/ph-address";
import { ensureVatRemoved } from "@/lib/server/vat-cleanup";
import { ensureWarrantyDates, projectWarranty, warrantyOnCompletion, warrantySummary } from "@/lib/server/warranty";
import type {
  ConstructionProjectDto,
  CostEstimateDto,
  EstimateLineItem,
  EstimateRevisionChange,
} from "@/types/construction";
import type { SessionUser, UserRole } from "@/types/domain";

/** Invoices are capped at PHP 1,000,000,000 each, so a contract total must stay within it too. */
const MAX_CONTRACT_TOTAL = 1_000_000_000;
const estimateStatuses = ["Requested", "Draft", "Sent", "Revision requested", "Accepted"] as const;
const editableStatuses = ["Requested", "Draft", "Revision requested"] as const;
/** Customers only see the BOQ once the admin has sent it. */
const hiddenFromCustomer = new Set<string>(editableStatuses);

const idPattern = /^[a-f\d]{24}$/i;
const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

const isoDate = (value?: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const addDays = (date: string, days: number) => {
  const value = dateOnly(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const twoDecimals = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001;
const objectId = (value: string, message: string, status = 404) => {
  if (!idPattern.test(value)) throw new BillingError(message, status);
  return new ObjectId(value);
};

function requireRole(actor: SessionUser, roles: UserRole[], message: string) {
  if (!roles.includes(actor.role)) throw new BillingError(message, 403);
}

// ───────────────────────── Schemas ─────────────────────────

const requestSchema = z.object({
  designRequestId: z.string().regex(idPattern, "Select one of your unlocked designs."),
  preferredStartDate: z.iso.date("Choose your preferred start date."),
  neededBy: z.iso.date("Choose the date you need the house by."),
  siteAddress: addressDetailsSchema,
  notes: z.string().trim().max(4_000).default(""),
}).strict();

const lineMaterialSchema = z.object({
  id: z.uuid().optional(),
  materialId: z.string().regex(idPattern, "Choose each material from the list."),
  quantity: z.number().finite().positive("Material quantities must be greater than 0.").max(10_000_000)
    .refine(twoDecimals, "Use at most two decimal places for material quantities."),
}).strict();

const lineItemSchema = z.object({
  /** A saved scope keeps its id, so the customer's change requests still point at it. */
  id: z.uuid().optional(),
  item: z.string().trim().min(1, "Every line item needs a name.").max(160),
  description: z.string().trim().max(500),
  unit: z.string().trim().min(1, "Every line item needs a unit.").max(30),
  quantity: z.number().finite().positive("Quantities must be greater than 0.").max(10_000_000),
  unitPrice: z.number().finite().min(0).max(1_000_000_000).refine(twoDecimals, "Use at most two decimal places for unit prices."),
  /** When listed, the scope is priced from Maintenance > Materials and `unitPrice` is ignored. */
  materials: z.array(lineMaterialSchema).max(100, "List at most 100 materials in one scope of work.").optional(),
}).strict();

const revisionChangeSchema = z.object({
  lineId: z.string().min(1).max(100),
  materialLineId: z.string().min(1).max(100),
  wants: z.string().trim().min(2, "Enter the material you want (at least 2 characters).").max(materialNameMax, "Keep the material name within 120 characters."),
}).strict();

const templateRowSchema = z.object({
  label: z.string().trim().min(1, "Every milestone needs a label.").max(120),
  description: z.string().trim().max(500),
  percentage: z.number().finite().min(0).max(100),
  targetDate: z.union([z.literal(""), z.iso.date()]),
}).strict();

const estimateActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    lineItems: z.array(lineItemSchema).min(1, "Add at least one line item.").max(200),
    scheduleTemplate: z.array(templateRowSchema).min(2, "Add the downpayment and at least one progress milestone.").max(8),
    adminNotes: z.string().trim().max(4_000),
  }).strict(),
  z.object({ action: z.literal("send") }).strict(),
  z.object({
    action: z.literal("request-revision"),
    reason: z.string().trim().max(1_000),
    changes: z.array(revisionChangeSchema).max(100).default([]),
  }).strict().refine((value) => value.changes.length > 0 || value.reason.length >= 5, {
    message: "Tell us what should change (at least 5 characters).", path: ["reason"],
  }),
  z.object({
    action: z.literal("accept"),
    downpaymentPercent: z.number().finite().max(100).refine(twoDecimals, "Use at most two decimal places."),
  }).strict(),
]);

const projectActionSchema = z.object({
  action: z.literal("status"),
  status: z.enum(["Active", "On hold", "Completed"]),
  designName: z.string().trim().min(2, "Enter a design name of at least 2 characters.").max(120, "Keep the design name within 120 characters.").optional(),
  houseType: z.string().trim().min(1, "Choose a house type.").max(80).optional(),
}).strict();

// ───────────────────────── Notifications ─────────────────────────

async function activeUsers(db: Db, session: ClientSession, role: UserRole) {
  return db.collection<UserDocument>(collections.users).find({ role, status: "active" }, { session, projection: { _id: 1 } }).toArray();
}

async function notify(db: Db, session: ClientSession, userIds: ObjectId[], note: Pick<NotificationDocument, "title" | "body" | "href" | "kind" | "entityId">) {
  if (!userIds.length) return;
  const createdAt = new Date();
  await insertNotifications(
    db, userIds.map((userId) => ({ _id: new ObjectId(), userId, ...note, createdAt })), session,
  );
}

// ───────────────────────── DTOs ─────────────────────────

const designLabelOf = (design?: DesignRequestDocument | null) =>
  design ? design.selectedDesign?.name ?? `${design.floorArea} sqm · ${design.rooms}` : "Construction estimate";

/** Customers see which materials a scope uses, never their prices or quantities. */
function lineItemDto(line: EstimateLineItemDocument, viewer: UserRole): EstimateLineItem {
  const { materials, ...scope } = line;
  if (!materials?.length) return scope;
  return {
    ...scope,
    materials: materials.map((material) => (viewer === "customer"
      ? { id: material.id, name: material.name }
      : {
        id: material.id, name: material.name, materialId: material.materialId.toHexString(),
        unitPrice: material.unitPrice, quantity: material.quantity, amount: material.amount,
      })),
  };
}

async function toEstimateDtos(db: Db, estimates: EstimateDocument[], viewer: UserRole): Promise<CostEstimateDto[]> {
  const customerIds = [...new Set(estimates.map((estimate) => estimate.customerId.toHexString()))].map((id) => new ObjectId(id));
  const designIds = estimates.flatMap((estimate) => (estimate.designRequestId ? [estimate.designRequestId] : []));
  const [customers, designs] = await Promise.all([
    customerIds.length ? db.collection<UserDocument>(collections.users).find({ _id: { $in: customerIds } }, { projection: { name: 1, email: 1 } }).toArray() : [],
    designIds.length ? db.collection<DesignRequestDocument>(collections.designRequests).find({ _id: { $in: designIds } }, { projection: { selectedDesign: 1, floorArea: 1, rooms: 1, finish: 1 } }).toArray() : [],
  ]);
  const customerById = new Map(customers.map((customer) => [customer._id.toHexString(), customer]));
  const designById = new Map(designs.map((design) => [design._id.toHexString(), design]));
  return estimates.map((estimate) => {
    const customer = customerById.get(estimate.customerId.toHexString());
    const design = estimate.designRequestId ? designById.get(estimate.designRequestId.toHexString()) : undefined;
    const hidden = viewer === "customer" && hiddenFromCustomer.has(estimate.status);
    return {
      id: estimate._id.toHexString(), reference: estimate.reference, status: estimate.status as CostEstimateDto["status"],
      customer: { id: estimate.customerId.toHexString(), name: customer?.name ?? "Unknown customer", email: customer?.email ?? "" },
      designRequestId: estimate.designRequestId?.toHexString() ?? null,
      designLabel: designLabelOf(design as DesignRequestDocument | undefined),
      floorArea: design?.floorArea ?? null,
      // A published-design request takes the design's finish level; an old finish on the request itself does not apply.
      finish: (design?.selectedDesign ? design.selectedDesign.finish : design?.finish) ?? null,
      preferredStartDate: isoDate(estimate.preferredStartDate), neededBy: isoDate(estimate.neededBy),
      siteAddress: estimate.siteAddress ?? "", siteAddressDetails: estimate.siteAddressDetails ?? null,
      customerNotes: estimate.customerNotes ?? "",
      lineItems: hidden ? [] : (estimate.lineItems ?? []).map((line) => lineItemDto(line, viewer)),
      subtotal: hidden ? 0 : estimate.subtotal ?? 0,
      total: hidden ? 0 : estimate.total ?? 0,
      scheduleTemplate: hidden ? [] : estimate.scheduleTemplate ?? [],
      adminNotes: hidden ? "" : estimate.adminNotes ?? "",
      revisionNote: estimate.revisionNote ?? null,
      revisionChanges: estimate.revisionChanges ?? [],
      sentAt: estimate.sentAt?.toISOString() ?? null, acceptedAt: estimate.acceptedAt?.toISOString() ?? null,
      downpaymentPercent: estimate.downpaymentPercent ?? null, projectId: estimate.projectId?.toHexString() ?? null,
      createdAt: estimate.createdAt.toISOString(), updatedAt: estimate.updatedAt.toISOString(),
    };
  });
}

async function estimateResponse(db: Db, actor: SessionUser, id: ObjectId) {
  const estimate = await db.collection<EstimateDocument>(collections.estimates).findOne({ _id: id });
  if (!estimate) throw new BillingError("Estimate not found.", 404);
  return (await toEstimateDtos(db, [estimate], actor.role))[0];
}

async function findEstimate(db: Db, actor: SessionUser, id: string, session?: ClientSession) {
  const estimate = await db.collection<EstimateDocument>(collections.estimates).findOne({
    _id: objectId(id, "Estimate not found."), status: { $in: [...estimateStatuses] },
    ...(actor.role === "customer" ? { customerId: new ObjectId(actor.id) } : {}),
  }, { session });
  if (!estimate) throw new BillingError("Estimate not found.", 404);
  return estimate;
}

// ───────────────────────── Estimates ─────────────────────────

export async function createConstructionRequest(db: Db, actor: SessionUser, raw: unknown): Promise<CostEstimateDto> {
  requireRole(actor, ["customer"], "Only customers can request construction.");
  const input = requestSchema.parse(raw);
  const customerId = new ObjectId(actor.id);
  const design = await db.collection<DesignRequestDocument>(collections.designRequests).findOne({
    _id: objectId(input.designRequestId, "Design request not found."), customerId,
  });
  if (!design) throw new BillingError("Design request not found.", 404);
  if ((await customerDesignDto(db, design)).access !== "unlocked") {
    throw new BillingError(designWorkflow(design) === "blueprint"
      ? "Pay the blueprint fee in full before proceeding to construction."
      : "Your house design must be fully paid and unlocked before you can proceed to construction.", 409);
  }
  if (input.preferredStartDate <= manilaDate()) throw new BillingError("Choose a preferred start date after today.");
  if (input.neededBy <= input.preferredStartDate) throw new BillingError("The needed-by date must be after your preferred start date.");
  const duplicate = new BillingError("A construction request already exists for this design. Open it from Proceed to Construction.", 409);

  try {
    const id = await billingTransaction(db, async (session) => {
      const estimates = db.collection<EstimateDocument>(collections.estimates);
      if (await estimates.countDocuments({ designRequestId: design._id }, { session })) throw duplicate;
      const now = new Date();
      const estimate: EstimateDocument = {
        _id: new ObjectId(), reference: await nextReference(db, session, "EST", now), customerId,
        designRequestId: design._id, ...(design.houseDesignId ?? design.selectedDesign?.id ? { houseDesignId: design.houseDesignId ?? new ObjectId(design.selectedDesign!.id) } : {}),
        preferredStartDate: dateOnly(input.preferredStartDate), neededBy: dateOnly(input.neededBy),
        siteAddress: formatAddress(input.siteAddress), siteAddressDetails: input.siteAddress, customerNotes: input.notes,
        lineItems: [], subtotal: 0, total: 0, scheduleTemplate: [], adminNotes: "",
        status: "Requested", createdAt: now, updatedAt: now,
      };
      await estimates.insertOne(estimate, { session });
      await notify(db, session, (await activeUsers(db, session, "admin")).map((admin) => admin._id), {
        title: "New construction request",
        body: `${actor.name} wants to build ${designLabelOf(design)} (${estimate.reference}). Prepare the cost estimate.`,
        href: `/admin/cost-estimates?estimate=${estimate._id.toHexString()}`, kind: "construction-request", entityId: estimate._id,
      });
      await audit(db, session, actor, "estimate.requested", "estimate", estimate._id, {
        reference: estimate.reference, preferredStartDate: input.preferredStartDate, neededBy: input.neededBy,
      });
      return estimate._id;
    });
    return await estimateResponse(db, actor, id);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw duplicate;
    throw error;
  }
}

export async function listEstimates(db: Db, actor: SessionUser): Promise<CostEstimateDto[]> {
  requireRole(actor, ["customer", "admin"], "You do not have access to cost estimates.");
  await ensureVatRemoved(db);
  const estimates = await db.collection<EstimateDocument>(collections.estimates).find({
    status: { $in: [...estimateStatuses] },
    ...(actor.role === "customer" ? { customerId: new ObjectId(actor.id) } : {}),
  }).sort({ updatedAt: -1 }).limit(500).toArray();
  return toEstimateDtos(db, estimates, actor.role);
}

export async function getEstimate(db: Db, actor: SessionUser, id: string): Promise<CostEstimateDto> {
  requireRole(actor, ["customer", "admin"], "You do not have access to cost estimates.");
  await ensureVatRemoved(db);
  return (await toEstimateDtos(db, [await findEstimate(db, actor, id)], actor.role))[0];
}

type EstimateAction = z.infer<typeof estimateActionSchema>;

export async function changeEstimate(db: Db, actor: SessionUser, id: string, raw: unknown): Promise<{ estimate: CostEstimateDto; projectId?: string }> {
  requireRole(actor, ["customer", "admin"], "You do not have access to cost estimates.");
  const input = estimateActionSchema.parse(raw);
  const staffAction = input.action === "save" || input.action === "send";
  if (staffAction && actor.role !== "admin") throw new BillingError("Only an administrator can prepare and send cost estimates.", 403);
  // An open estimate is never accepted at its old VAT-inclusive total.
  await ensureVatRemoved(db);
  if (!staffAction && actor.role !== "customer") throw new BillingError("Only the customer can respond to an estimate.", 403);

  const result = await billingTransaction(db, async (session): Promise<{ estimateId: ObjectId; projectId?: ObjectId }> => {
    const estimate = await findEstimate(db, actor, id, session);
    if (input.action === "save") return { estimateId: estimate._id, ...(await saveEstimate(db, session, actor, estimate, input)) };
    if (input.action === "send") return { estimateId: estimate._id, ...(await sendEstimate(db, session, actor, estimate)) };
    if (input.action === "request-revision") return { estimateId: estimate._id, ...(await requestRevision(db, session, actor, estimate, input)) };
    return { estimateId: estimate._id, ...(await acceptEstimate(db, session, actor, estimate, input.downpaymentPercent)) };
  });
  return {
    estimate: await estimateResponse(db, actor, result.estimateId),
    ...(result.projectId ? { projectId: result.projectId.toHexString() } : {}),
  };
}

async function guardedEstimateUpdate(db: Db, session: ClientSession, estimate: EstimateDocument, update: Parameters<ReturnType<Db["collection"]>["updateOne"]>[1], message: string) {
  const result = await db.collection<EstimateDocument>(collections.estimates).updateOne({ _id: estimate._id, status: estimate.status }, update as never, { session });
  if (!result.matchedCount) throw new BillingError(message, 409);
}

/**
 * A scope with materials is one lot priced at the total of its materials, each at its current price in
 * Maintenance > Materials. A scope without materials keeps the lump sum the admin typed.
 */
async function pricedLineItems(db: Db, session: ClientSession, lines: Extract<EstimateAction, { action: "save" }>["lineItems"]) {
  const picked = lines.flatMap((line) => line.materials ?? []);
  const catalog = await findMaterials(db, [...new Set(picked.map((entry) => entry.materialId.toLowerCase()))].map((id) => new ObjectId(id)), session);
  // Saved rows keep their ids; a new or repeated id gets a fresh one.
  const usedIds = new Set<string>();
  const rowId = (id?: string) => {
    const next = id && !usedIds.has(id) ? id : randomUUID();
    usedIds.add(next);
    return next;
  };
  return lines.map(({ id, materials = [], ...line }): EstimateLineItemDocument => {
    if (!materials.length) return { id: rowId(id), ...line, amount: lineAmount(line.quantity, line.unitPrice) };
    if (new Set(materials.map((entry) => entry.materialId.toLowerCase())).size !== materials.length) {
      throw new BillingError(`List each material once in ${line.item}.`);
    }
    const priced = materials.map((entry) => {
      const material = catalog.get(entry.materialId.toLowerCase());
      if (!material) throw new BillingError(`A material in ${line.item} is no longer in Maintenance. Reload the estimate and pick it again.`, 409);
      return {
        id: rowId(entry.id), materialId: material._id, name: material.name, unitPrice: material.price,
        quantity: entry.quantity, amount: lineAmount(entry.quantity, material.price),
      };
    });
    const total = fromCentavos(priced.reduce((sum, material) => sum + toCentavos(material.amount), 0));
    if (total > MAX_CONTRACT_TOTAL) throw new BillingError("The contract total cannot exceed PHP 1,000,000,000.");
    return { id: rowId(id), ...line, unit: "lot", quantity: 1, unitPrice: total, amount: total, materials: priced };
  });
}

async function saveEstimate(db: Db, session: ClientSession, actor: SessionUser, estimate: EstimateDocument, input: Extract<EstimateAction, { action: "save" }>) {
  if (!(editableStatuses as readonly string[]).includes(estimate.status)) {
    throw new BillingError("This estimate was already sent to the customer and can no longer be edited.", 409);
  }
  const lineItems = await pricedLineItems(db, session, input.lineItems);
  const totals = estimateTotals(lineItems);
  if (totals.total > MAX_CONTRACT_TOTAL) throw new BillingError("The contract total cannot exceed PHP 1,000,000,000.");
  await guardedEstimateUpdate(db, session, estimate, { $set: {
    lineItems, ...totals, scheduleTemplate: input.scheduleTemplate, adminNotes: input.adminNotes,
    status: "Draft", updatedAt: new Date(),
  }, $unset: { vat: "", vatRate: "" } }, "This estimate changed while you were editing. Reload it and try again.");
  await audit(db, session, actor, "estimate.saved", "estimate", estimate._id, { reference: estimate.reference, total: totals.total, lineItems: lineItems.length });
  return {};
}

async function sendEstimate(db: Db, session: ClientSession, actor: SessionUser, estimate: EstimateDocument) {
  if (estimate.status !== "Draft" && estimate.status !== "Revision requested") {
    throw new BillingError("Save the estimate before sending it. Sent estimates cannot be sent again.", 409);
  }
  if (!estimate.lineItems?.length) throw new BillingError("Add at least one line item before sending the estimate.");
  if (!(estimate.total > 0)) throw new BillingError("The estimate total must be greater than 0.");
  if (estimate.total > MAX_CONTRACT_TOTAL) throw new BillingError("The contract total cannot exceed PHP 1,000,000,000.");
  const template = estimate.scheduleTemplate ?? [];
  const problem = scheduleTemplateError(template);
  if (problem) throw new BillingError(problem);
  if (template.some((row) => row.label.trim().length < 3)) throw new BillingError("Milestone labels need at least 3 characters.");
  if (template[0].targetDate < manilaDate()) throw new BillingError("The downpayment target date cannot be in the past.");
  const now = new Date();
  await guardedEstimateUpdate(db, session, estimate, {
    $set: { status: "Sent", sentAt: now, sentBy: new ObjectId(actor.id), updatedAt: now }, $unset: { revisionNote: "", revisionChanges: "" },
  }, "This estimate changed while you were sending it. Reload it and try again.");
  await notify(db, session, [estimate.customerId], {
    title: "Your construction cost estimate is ready",
    body: `${estimate.reference} totals ${estimate.total.toLocaleString("en-PH", { style: "currency", currency: "PHP" })}. Review it and choose your downpayment.`,
    href: `/customer/dream-house?estimate=${estimate._id.toHexString()}`, kind: "construction-estimate", entityId: estimate._id,
  });
  await audit(db, session, actor, "estimate.sent", "estimate", estimate._id, { reference: estimate.reference, total: estimate.total });
  return {};
}

/** The materials the customer picked, named as the sent estimate showed them. */
function revisionChangesOf(estimate: EstimateDocument, changes: Extract<EstimateAction, { action: "request-revision" }>["changes"]) {
  const seen = new Set<string>();
  return changes.map((change): EstimateRevisionChange => {
    const line = estimate.lineItems?.find((item) => item.id === change.lineId);
    const material = line?.materials?.find((item) => item.id === change.materialLineId);
    if (!line || !material) throw new BillingError("A material you picked is no longer in this estimate. Reload it and try again.", 409);
    if (seen.has(material.id)) throw new BillingError(`Ask for one change to ${material.name} only.`);
    seen.add(material.id);
    if (materialNameKey(change.wants) === materialNameKey(material.name)) throw new BillingError(`Enter a different material than ${material.name}.`);
    return { scope: line.item, material: material.name, wants: change.wants, lineId: line.id, materialLineId: material.id };
  });
}

async function requestRevision(
  db: Db, session: ClientSession, actor: SessionUser, estimate: EstimateDocument, input: Extract<EstimateAction, { action: "request-revision" }>,
) {
  if (estimate.status !== "Sent") throw new BillingError("Only a sent estimate can be sent back for revision.", 409);
  const { reason } = input;
  const changes = revisionChangesOf(estimate, input.changes);
  await guardedEstimateUpdate(db, session, estimate, {
    $set: { status: "Revision requested", revisionChanges: changes, updatedAt: new Date(), ...(reason ? { revisionNote: reason } : {}) },
    ...(reason ? {} : { $unset: { revisionNote: "" } }),
  }, "This estimate changed. Reload it and try again.");
  const summary = [
    ...changes.map((change) => `${change.material} → ${change.wants}`),
    ...(reason ? [reason] : []),
  ].join("; ");
  await notify(db, session, (await activeUsers(db, session, "admin")).map((admin) => admin._id), {
    title: "Estimate revision requested",
    body: `${actor.name} asked for changes to ${estimate.reference}: ${summary.length > 120 ? `${summary.slice(0, 117)}…` : summary}`,
    href: `/admin/cost-estimates?estimate=${estimate._id.toHexString()}`, kind: "construction-revision", entityId: estimate._id,
  });
  await audit(db, session, actor, "estimate.revision-requested", "estimate", estimate._id, {
    reference: estimate.reference, reason, materialChanges: changes.length,
  });
  return {};
}

/**
 * Accepting creates the project, its payment schedule, the downpayment invoice, and calendar events together. The
 * downpayment invoice is issued at once, or as soon as the blueprint fee is fully paid if it is not yet.
 */
async function acceptEstimate(db: Db, session: ClientSession, actor: SessionUser, estimate: EstimateDocument, downpaymentPercent: number) {
  if (estimate.status !== "Sent") throw new BillingError("This estimate is not awaiting your response.", 409);
  const template = estimate.scheduleTemplate ?? [];
  const minimum = Math.max(MIN_DOWNPAYMENT_PERCENT, template[0]?.percentage ?? 0);
  if (downpaymentPercent < minimum) throw new BillingError(`The downpayment must be at least ${minimum}% of the contract total.`);
  if (scheduleTemplateError(template) || !estimate.preferredStartDate || !estimate.neededBy || !estimate.designRequestId) {
    throw new BillingError("This estimate is incomplete. Ask us to revise it.", 409);
  }
  const now = new Date();
  const projectId = new ObjectId();
  const updated = await db.collection<EstimateDocument>(collections.estimates).updateOne(
    { _id: estimate._id, status: "Sent" },
    { $set: { status: "Accepted", acceptedAt: now, downpaymentPercent, projectId, updatedAt: now } }, { session },
  );
  if (!updated.matchedCount) throw new BillingError("This estimate was already answered.", 409);

  const design = await db.collection<DesignRequestDocument>(collections.designRequests).findOne({ _id: estimate.designRequestId }, { session });
  const schedule: ProjectMilestoneDocument[] = buildPaymentSchedule(estimate.total, template, downpaymentPercent).map((row) => ({
    id: randomUUID(), label: row.label, description: row.description, percentage: row.percentage, amount: row.amount,
    targetDate: dateOnly(row.targetDate), isDownpayment: row.isDownpayment,
  }));
  const downpayment = schedule[0];
  const startDate = isoDate(estimate.preferredStartDate)!;
  const today = manilaDate(now);
  const lowest = addDays(today, 1);
  const dueDate = [addDays(today, 7), startDate < lowest ? lowest : startDate].sort()[0];

  const invoiceId = new ObjectId();
  downpayment.invoiceId = invoiceId;
  const project: ProjectDocument = {
    _id: projectId, reference: await nextReference(db, session, "PRJ", now), customerId: estimate.customerId,
    ...(estimate.houseDesignId ? { houseDesignId: estimate.houseDesignId } : {}),
    name: `${designLabelOf(design)} – Construction`, status: "Awaiting downpayment", contractPrice: estimate.total,
    subtotal: estimate.subtotal, startDate: estimate.preferredStartDate, targetCompletionDate: estimate.neededBy,
    estimateId: estimate._id, designRequestId: estimate.designRequestId, downpaymentPercent, paymentSchedule: schedule,
    createdAt: now, updatedAt: now,
  };
  const invoice: InvoiceDocument = {
    _id: invoiceId, invoiceNumber: await nextReference(db, session, "INV", now), customerId: estimate.customerId,
    projectId, milestoneId: downpayment.id, label: downpayment.label,
    basis: `Downpayment per accepted estimate ${estimate.reference}`, progressPercentage: 0, amount: downpayment.amount,
    dueDate: dateOnly(dueDate), status: "Draft", createdAt: now, updatedAt: now,
  };
  await db.collection<ProjectDocument>(collections.projects).insertOne(project, { session });
  await db.collection<InvoiceDocument>(collections.invoices).insertOne(invoice, { session });
  await db.collection<ScheduleDocument>(collections.schedules).insertMany(schedule.map((milestone) => ({
    _id: new ObjectId(), title: `${milestone.label} due — ${project.name}`, eventType: "Payment due" as const,
    clientId: estimate.customerId, clientName: actor.name, projectId, projectName: project.name,
    scheduledFor: new Date(`${milestone.targetDate.toISOString().slice(0, 10)}T01:00:00.000Z`), durationMinutes: 30,
    status: "Scheduled" as const, paymentStatus: "Expected" as const, expectedAmount: milestone.amount, milestoneId: milestone.id,
    createdBy: estimate.sentBy ?? new ObjectId(actor.id), createdByName: "Construction schedule", createdAt: now, updatedAt: now,
  })), { session });

  const [clerks, admins] = await Promise.all([activeUsers(db, session, "billing-clerk"), activeUsers(db, session, "admin")]);
  // Estimates accepted before the blueprint was paid (older requests) still wait for the blueprint fee.
  const blueprintFirst = Boolean(design && designWorkflow(design) === "blueprint" && (await customerDesignDto(db, design)).access !== "unlocked");
  if (!blueprintFirst) await autoIssueDownpayment(db, session, actor, project, now);
  await notify(db, session, clerks.map((clerk) => clerk._id), blueprintFirst ? {
    title: "Blueprint fee ready to bill",
    body: `${actor.name} accepted ${estimate.reference}. Once the admin submits the blueprint, set the blueprint fee and issue its invoice. The ${downpayment.label} invoice (${invoice.invoiceNumber}) is issued automatically once the blueprint is paid.`,
    href: "/billing-clerk/progress-billings", kind: "blueprint-fee", entityId: estimate.designRequestId,
  } : {
    title: "Downpayment invoice issued",
    body: `${actor.name} accepted ${estimate.reference}. The ${downpayment.label} invoice (${invoice.invoiceNumber}) for ${project.reference} was issued automatically and awaits payment.`,
    href: "/billing-clerk/progress-billings", kind: "construction-project", entityId: projectId,
  });
  await notify(db, session, admins.map((admin) => admin._id), {
    title: "Cost estimate accepted",
    body: blueprintFirst
      ? `${actor.name} accepted ${estimate.reference} with a ${downpaymentPercent}% downpayment. Upload the blueprint files in Approvals, then submit them so the Billing Clerk can bill the blueprint fee.`
      : `${actor.name} accepted ${estimate.reference} with a ${downpaymentPercent}% downpayment. ${project.reference} is awaiting its downpayment.`,
    href: blueprintFirst ? "/admin/approvals" : `/admin/cost-estimates?estimate=${estimate._id.toHexString()}`, kind: "construction-project", entityId: projectId,
  });
  await audit(db, session, actor, "estimate.accepted", "estimate", estimate._id, {
    reference: estimate.reference, projectReference: project.reference, downpaymentPercent, total: estimate.total,
  });
  return { projectId };
}

// ───────────────────────── Projects ─────────────────────────

async function toProjectDtos(db: Db, projects: ProjectDocument[], viewer: UserRole, session?: ClientSession): Promise<ConstructionProjectDto[]> {
  if (!projects.length) return [];
  const customerIds = [...new Set(projects.map((project) => project.customerId.toHexString()))].map((id) => new ObjectId(id));
  const estimateIds = projects.flatMap((project) => (project.estimateId ? [project.estimateId] : []));
  const requestIds = projects.flatMap((project) => (project.designRequestId ? [project.designRequestId] : []));
  const [billing, customers, estimates, requests, { warrantyMonths }] = await Promise.all([
    loadProjectBilling(db, projects.map((project) => project._id), session),
    db.collection<UserDocument>(collections.users).find({ _id: { $in: customerIds } }, { session, projection: { name: 1 } }).toArray(),
    estimateIds.length ? db.collection<EstimateDocument>(collections.estimates).find({ _id: { $in: estimateIds } }, { session, projection: { reference: 1 } }).toArray() : [],
    requestIds.length ? db.collection<DesignRequestDocument>(collections.designRequests).find({ _id: { $in: requestIds } }, { session, projection: { houseType: 1 } }).toArray() : [],
    getSystemSettings(db),
  ]);
  const customerNames = new Map(customers.map((customer) => [customer._id.toHexString(), customer.name]));
  const estimateReferences = new Map(estimates.map((estimate) => [estimate._id.toHexString(), estimate.reference]));
  const houseTypes = new Map(requests.map((request) => [request._id.toHexString(), request.houseType ?? null]));
  return projects.map((project) => {
    const milestones = milestoneDtos(project, billing, viewer === "customer");
    const paid = billing.paidByProject.get(project._id.toHexString()) ?? 0;
    return {
      id: project._id.toHexString(), reference: project.reference, name: project.name, status: project.status,
      houseType: project.designRequestId ? houseTypes.get(project.designRequestId.toHexString()) ?? null : null,
      customer: { id: project.customerId.toHexString(), name: customerNames.get(project.customerId.toHexString()) ?? "Unknown customer" },
      estimateId: project.estimateId?.toHexString() ?? null,
      estimateReference: project.estimateId ? estimateReferences.get(project.estimateId.toHexString()) ?? null : null,
      contractPrice: project.contractPrice, subtotal: project.subtotal ?? project.contractPrice,
      downpaymentPercent: project.downpaymentPercent ?? null,
      startDate: isoDate(project.startDate), neededBy: isoDate(project.targetCompletionDate),
      paid, balance: Math.max(0, Math.round((project.contractPrice - paid) * 100) / 100),
      milestones, nextMilestone: milestones.find((milestone) => milestone.status !== "Paid") ?? null,
      warranty: projectWarranty(project, warrantyMonths),
      createdAt: project.createdAt.toISOString(),
    };
  });
}

export async function listProjects(db: Db, actor: SessionUser): Promise<ConstructionProjectDto[]> {
  requireRole(actor, ["customer", "admin", "billing-clerk"], "You do not have access to construction projects.");
  await promoteScheduledProjects(db);
  await ensureVatRemoved(db);
  await ensureWarrantyDates(db);
  const projects = await db.collection<ProjectDocument>(collections.projects)
    .find(actor.role === "customer" ? { customerId: new ObjectId(actor.id) } : {}).sort({ createdAt: -1 }).limit(500).toArray();
  return toProjectDtos(db, projects, actor.role);
}

export async function changeProjectStatus(db: Db, actor: SessionUser, id: string, raw: unknown): Promise<{ project: ConstructionProjectDto }> {
  requireRole(actor, ["admin"], "Only an administrator can change a project's status.");
  const input = projectActionSchema.parse(raw);
  const projectId = objectId(id, "Project not found.");
  const design = input.status === "Completed" ? { name: input.designName, houseType: input.houseType } : null;
  // Checked before completing, so a rejected name or type leaves the project as it was.
  if (design?.name && await houseDesignNameTaken(db, design.name)) {
    throw new BillingError(`A house design named "${design.name}" already exists. Use a different name.`, 409);
  }
  if (design?.houseType && !(await isActiveHouseType(db, design.houseType))) {
    throw new BillingError("Choose one of the available house types.", 400);
  }
  await promoteScheduledProjects(db);
  // The warranty length in force on the day of completion is saved with the project.
  const { warrantyMonths } = await getSystemSettings(db);
  const result = await billingTransaction(db, async (session) => {
    const projects = db.collection<ProjectDocument>(collections.projects);
    const project = await projects.findOneAndUpdate({ _id: projectId }, { $inc: { billingVersion: 1 } }, { session, returnDocument: "after" });
    if (!project) throw new BillingError("Project not found.", 404);
    const milestones = milestoneDtos(project, await loadProjectBilling(db, [project._id], session));
    const from = project.status;
    if (input.status === "Active") {
      if (from !== "Scheduled" && from !== "On hold") throw new BillingError("Only a scheduled or on-hold project can be started or resumed.", 409);
      if (milestones.length && milestones[0].status !== "Paid") throw new BillingError("The downpayment must be fully paid before construction starts.", 409);
    } else if (input.status === "On hold") {
      if (from !== "Active" && from !== "Scheduled") throw new BillingError("Only an active or scheduled project can be put on hold.", 409);
    } else {
      if (from !== "Active") throw new BillingError("Only an active project can be marked completed.", 409);
      if (milestones.some((milestone) => milestone.status !== "Paid")) throw new BillingError("Every payment milestone must be fully paid before the project is completed.", 409);
    }
    const now = new Date();
    const warranty = input.status === "Completed" ? warrantyOnCompletion(now, warrantyMonths) : null;
    const moved = await projects.updateOne({ _id: project._id, status: from }, {
      $set: { status: input.status, updatedAt: now, ...(warranty ? { completedAt: now, ...warranty } : {}) },
    }, { session });
    if (!moved.matchedCount) throw new BillingError("The project changed. Reload it and try again.", 409);
    const completed = warranty ? projectWarranty({ status: "Completed", completedAt: now, updatedAt: now, ...warranty }, warrantyMonths) : null;
    await notify(db, session, [project.customerId], {
      title: `Project ${input.status === "Completed" ? "completed" : input.status === "On hold" ? "put on hold" : "is active"}`,
      body: `${project.name} is now ${input.status.toLowerCase()}.${completed ? ` ${warrantySummary(completed)} Use Report a Problem in Dream House if something needs fixing.` : ""}`,
      href: "/customer/dream-house", kind: "construction-project", entityId: project._id,
    });
    await audit(db, session, actor, "project.status-changed", "project", project._id, { reference: project.reference, from, to: input.status });
    const updated = await projects.findOne({ _id: project._id }, { session });
    return { project: (await toProjectDtos(db, [updated!], actor.role, session))[0] };
  });
  if (design) {
    // The finished project becomes a draft house design; completing the project must not fail because of it.
    await saveCompletedProjectDesign(db, actor, projectId, design).catch((error: unknown) => {
      console.error("Could not create the house design for a completed project", { errorType: error instanceof Error ? error.name : "UnknownError" });
    });
  }
  return result;
}
