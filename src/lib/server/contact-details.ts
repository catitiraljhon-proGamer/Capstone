import type { Db } from "mongodb";
import { z } from "zod";
import { collections, type ContactDetailsDocument } from "@/lib/database/collections";
import {
  contactFieldLabels,
  contactFields,
  defaultContactDetails,
  type ContactDetails,
  type ContactDetailsView,
} from "@/lib/contact-details";
import { recordAuditLog } from "@/lib/server/audit";
import { MaintenanceError } from "@/lib/server/maintenance";
import type { SessionUser } from "@/types/domain";

const contactId = "contact";
const contactCollection = (db: Db) => db.collection<ContactDetailsDocument>(collections.systemSettings);

export const contactDetailsSchema = z.object({
  phone: z.string().trim()
    .min(7, "Enter the phone number, for example (043) 407 3561.")
    .max(30, "Keep the phone number within 30 characters.")
    .regex(/^\+?[\d\s()-]+$/, "Use only digits, spaces, parentheses, dashes, and a leading +.")
    .refine((value) => value.replace(/\D/g, "").length >= 7, "Enter at least 7 digits for the phone number."),
  email: z.email("Enter a valid email address.").trim().max(120, "Keep the email address within 120 characters."),
  address: z.string().trim()
    .min(10, "Enter the full office address.")
    .max(200, "Keep the office address within 200 characters."),
}).strict();

export async function getContactDetails(db: Db): Promise<ContactDetails> {
  const saved = (await contactCollection(db).findOne({ _id: contactId }))?.values;
  return { ...defaultContactDetails, ...saved };
}

export async function getContactDetailsView(db: Db): Promise<ContactDetailsView> {
  const document = await contactCollection(db).findOne({ _id: contactId });
  const changes: ContactDetailsView["changes"] = {};
  for (const field of contactFields) {
    const change = document?.changes?.[field];
    if (change) changes[field] = { by: change.by, at: change.at.toISOString() };
  }
  return { contact: { ...defaultContactDetails, ...document?.values }, changes };
}

/** Saves the changed details, stamps who changed each one, and audits "old → new" per field. */
export async function updateContactDetails(db: Db, actor: SessionUser, raw: unknown, now = new Date()) {
  if (actor.role !== "admin") throw new MaintenanceError("Only the Admin can change the contact details.", 403);
  const input = contactDetailsSchema.parse(raw);
  const current = await getContactDetails(db);
  const changed = contactFields.filter((field) => input[field] !== current[field]);
  if (!changed.length) return getContactDetailsView(db);

  const set: Record<string, unknown> = {};
  for (const field of changed) {
    set[`values.${field}`] = input[field];
    set[`changes.${field}`] = { by: actor.name, at: now };
  }
  await contactCollection(db).updateOne({ _id: contactId }, { $set: { ...set, updatedAt: now } }, { upsert: true });
  await recordAuditLog({
    db, actor, action: "Updated contact details", entityType: "System", createdAt: now,
    details: Object.fromEntries(changed.map((field) => [contactFieldLabels[field], `${current[field]} → ${input[field]}`])),
  });
  return getContactDetailsView(db);
}
