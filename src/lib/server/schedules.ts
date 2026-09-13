import type { ScheduleDocument } from "@/lib/database/collections";
import { z } from "zod";

export const scheduleInputSchema = z.object({
  title: z.string().trim().min(2).max(120),
  eventType: z.enum(["Client meeting", "Payment follow-up", "Payment due"]),
  clientId: z.string().regex(/^[a-f\d]{24}$/i, "Select a valid client."),
  projectId: z
    .union([z.string().regex(/^[a-f\d]{24}$/i), z.literal("")])
    .optional(),
  scheduledFor: z.iso.datetime(),
  durationMinutes: z.number().int().min(15).max(480),
  location: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1_000).optional(),
  status: z.enum(["Scheduled", "Completed", "Cancelled"]),
  paymentStatus: z.enum([
    "Not applicable",
    "Expected",
    "Pending",
    "Paid",
    "Overdue",
  ]),
  expectedAmount: z.number().min(0).max(1_000_000_000_000).optional(),
});

export const scheduleStatusSchema = z
  .object({
    status: z.enum(["Scheduled", "Completed", "Cancelled"]).optional(),
    paymentStatus: z
      .enum(["Not applicable", "Expected", "Pending", "Paid", "Overdue"])
      .optional(),
  })
  .strict()
  .refine((changes) => changes.status || changes.paymentStatus, {
    message: "Select a schedule or payment status to update.",
  });

export function toScheduleDto(document: ScheduleDocument) {
  return {
    id: document._id.toHexString(),
    title: document.title,
    eventType: document.eventType,
    clientId: document.clientId.toHexString(),
    clientName: document.clientName,
    projectId: document.projectId?.toHexString(),
    projectName: document.projectName,
    scheduledFor: document.scheduledFor.toISOString(),
    durationMinutes: document.durationMinutes,
    location: document.location,
    notes: document.notes,
    status: document.status,
    paymentStatus: document.paymentStatus,
    expectedAmount: document.expectedAmount,
    createdByName: document.createdByName,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
