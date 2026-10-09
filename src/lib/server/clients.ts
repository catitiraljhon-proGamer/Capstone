import { collections, type UserDocument } from "@/lib/database/collections";
import { recordAuditLog } from "@/lib/server/audit";
import { addressDetailsSchema, formatAddress } from "@/lib/server/ph-address";
import type { ClientDetails, ClientDto, ClientListPayload } from "@/types/clients";
import { twoFactorSetupPaths } from "@/lib/two-factor-policy";
import { completeProfilePath, roleHomePaths, type SessionUser } from "@/types/domain";
import { hash } from "bcryptjs";
import { type Db, type Filter, ObjectId } from "mongodb";
import { z } from "zod";

const nameSchema = z.string().trim().min(2, "Enter the client's full name.").max(100);
const ageSchema = z.number().int("Age must be a whole number.").min(0).max(120, "Enter an age between 0 and 120.");
const contactNumberSchema = z.string().trim().min(7, "Enter a valid contact number.").max(25)
  .regex(/^\+?[0-9 ()-]+$/, "Use digits, spaces, parentheses, hyphens, and an optional leading +.")
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15;
  }, "The contact number must contain 7 to 15 digits.");

export const clientProfileSchema = z.object({
  name: nameSchema,
  age: ageSchema,
  contactNumber: contactNumberSchema,
  addressDetails: addressDetailsSchema,
  occupation: z.string().trim().max(100).default(""),
}).strict();

export const createClientSchema = clientProfileSchema.extend({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  password: z.string().min(8, "Use an initial password with at least 8 characters.").max(72),
});

export const clientListSchema = z.object({
  q: z.string().trim().max(100).default(""),
  view: z.enum(["current", "archived"]).default("current"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const clientArchiveSchema = z.object({ archived: z.boolean() }).strict();

export class ClientRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function requireClientAccess(actor: SessionUser, clientId?: string) {
  if (actor.role === "admin") return;
  if (actor.role === "customer" && clientId === actor.id) return;
  throw new ClientRequestError("You do not have access to this client record.", 403);
}

function objectId(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw new ClientRequestError("Invalid client id.", 400);
  return new ObjectId(id);
}

/** Stored records count as complete when the required fields exist, including legacy text-only addresses. */
const storedProfileSchema = z.object({
  name: nameSchema,
  age: ageSchema,
  contactNumber: contactNumberSchema,
  address: z.string().trim().min(5),
});

export function isClientProfileComplete(user: UserDocument) {
  return storedProfileSchema.safeParse({ name: user.name, ...user.clientDetails }).success;
}

/** Builds the stored client details, including the full address line, from validated input. */
export function toClientDetails(input: Omit<z.output<typeof clientProfileSchema>, "name">): ClientDetails {
  return {
    age: input.age,
    contactNumber: input.contactNumber,
    occupation: input.occupation,
    addressDetails: input.addressDetails,
    address: formatAddress(input.addressDetails),
  };
}

/**
 * Customers missing required client details (e.g. new Google sign-ups) fill
 * them in first; every account then turns on 2FA before using the portal.
 */
export function signInDestination(user: UserDocument) {
  if (user.role === "customer" && !isClientProfileComplete(user)) {
    return completeProfilePath;
  }
  return user.twoFactor ? roleHomePaths[user.role] : twoFactorSetupPaths[user.role];
}

export function toClientDto(user: UserDocument): ClientDto {
  const details = user.clientDetails;
  return {
    id: user._id.toHexString(), name: user.name, email: user.email,
    age: details?.age ?? null,
    contactNumber: details?.contactNumber ?? "",
    address: details?.address ?? "",
    addressDetails: details?.addressDetails ?? null,
    occupation: details?.occupation ?? "",
    status: user.status,
    archivedAt: user.clientArchivedAt?.toISOString() ?? null,
    profileComplete: isClientProfileComplete(user),
    createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString(),
  };
}

export async function listClients(db: Db, actor: SessionUser, rawInput: unknown): Promise<ClientListPayload> {
  requireClientAccess(actor);
  const { q, view, page, pageSize } = clientListSchema.parse(rawInput);
  const filter: Filter<UserDocument> = {
    role: "customer",
    clientArchivedAt: view === "archived" ? { $ne: null } : null,
  };
  if (q) {
    const literalQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["name", "email", "clientDetails.contactNumber", "clientDetails.address"]
      .map((field) => ({ [field]: { $regex: literalQuery, $options: "i" } }));
  }
  const users = db.collection<UserDocument>(collections.users);
  const total = await users.countDocuments(filter);
  const actualPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  const records = await users.find(filter, { projection: { passwordHash: 0, googleSub: 0, authVersion: 0 } })
    .sort({ createdAt: -1, _id: -1 }).skip((actualPage - 1) * pageSize).limit(pageSize).toArray();
  return { clients: records.map(toClientDto), total, page: actualPage, pageSize };
}

export async function getClient(db: Db, actor: SessionUser, id: string) {
  requireClientAccess(actor, id);
  const user = await db.collection<UserDocument>(collections.users).findOne({ _id: objectId(id), role: "customer" });
  if (!user) throw new ClientRequestError("Client record not found.", 404);
  return toClientDto(user);
}

export async function updateClient(db: Db, actor: SessionUser, id: string, rawInput: unknown) {
  requireClientAccess(actor, id);
  const { name, ...input } = clientProfileSchema.parse(rawInput);
  const clientDetails = toClientDetails(input);
  const updated = await db.collection<UserDocument>(collections.users).findOneAndUpdate(
    { _id: objectId(id), role: "customer" },
    { $set: { name, clientDetails, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw new ClientRequestError("Client record not found.", 404);
  await recordAuditLog({ db, actor, action: "client.updated", entityType: "user", entityId: updated._id,
    details: { fields: "name, age, contactNumber, address, occupation" } });
  return toClientDto(updated);
}

export async function createClient(db: Db, actor: SessionUser, rawInput: unknown) {
  requireClientAccess(actor);
  const { name, email, password, ...input } = createClientSchema.parse(rawInput);
  const clientDetails = toClientDetails(input);
  const now = new Date();
  const user: UserDocument = {
    _id: new ObjectId(), name, email, passwordHash: await hash(password, 12), clientDetails,
    role: "customer", status: "active", authVersion: 0, createdAt: now, updatedAt: now,
  };
  await db.collection<UserDocument>(collections.users).insertOne(user);
  await recordAuditLog({ db, actor, action: "client.created", entityType: "user", entityId: user._id,
    details: { role: "customer" } });
  return toClientDto(user);
}

export async function setClientArchived(db: Db, actor: SessionUser, id: string, rawInput: unknown) {
  requireClientAccess(actor);
  const { archived } = clientArchiveSchema.parse(rawInput);
  const clientId = objectId(id);
  const users = db.collection<UserDocument>(collections.users);
  const now = new Date();
  const updated = await users.findOneAndUpdate(
    { _id: clientId, role: "customer", clientArchivedAt: archived ? null : { $ne: null } },
    archived
      ? { $set: { clientArchivedAt: now, updatedAt: now } }
      : { $unset: { clientArchivedAt: "" }, $set: { updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!updated) {
    // Repeated requests keep the original archive date and do not duplicate audit events.
    const existing = await users.findOne({ _id: clientId, role: "customer" });
    if (!existing) throw new ClientRequestError("Client record not found.", 404);
    return toClientDto(existing);
  }
  await recordAuditLog({ db, actor, action: archived ? "client.archived" : "client.unarchived",
    entityType: "user", entityId: updated._id });
  return toClientDto(updated);
}
