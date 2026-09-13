import type { UserDocument } from "@/lib/database/collections";
import type { ManagedUserDto } from "@/types/domain";
import { z } from "zod";

export const userRoleSchema = z.enum(["customer", "billing-clerk", "admin"]);
export const userStatusSchema = z.enum(["active", "disabled"]);

const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter the user's full name.")
  .max(100, "The name must be 100 characters or fewer.");
const emailSchema = z.email("Enter a valid email address.").trim().toLowerCase();
const passwordSchema = z
  .string()
  .min(8, "The password must contain at least 8 characters.")
  .max(72, "The password must contain 72 characters or fewer.");

export const createManagedUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: userRoleSchema,
  status: userStatusSchema.optional().default("active"),
});

export const updateManagedUserSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Submit at least one account change.",
  });

export function toManagedUserDto(user: UserDocument): ManagedUserDto {
  return {
    id: user._id.toHexString(),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
