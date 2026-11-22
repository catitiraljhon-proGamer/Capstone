/** Customers deactivating or deleting their own account. Shared by the server, Manage Account, and Maintenance. */

export const dayMs = 86_400_000;

/** The optional "Why are you leaving?" answers; only G4 Builders sees them. */
export const closureReasons = [
  "My project is finished",
  "I'm not planning to build right now",
  "I chose another builder",
  "Too many notifications",
  "Other",
] as const;
export type ClosureReason = (typeof closureReasons)[number];

/** Typed by the customer to confirm deleting their account. */
export const deleteConfirmWord = "DELETE";

export type ClosureCheck = {
  key: "projects" | "balance" | "payments" | "requests" | "claims";
  title: string;
  ok: boolean;
  detail: string;
  href: string;
  linkLabel: string;
};

/** What the Deactivate or Delete tab shows before the customer chooses. */
export type AccountClosureDto = {
  checks: ClosureCheck[];
  /** False while anything is still open; both choices stay locked. */
  canClose: boolean;
  /** Long date the newest warranty ends, while one still runs. */
  warrantyUntil: string | null;
  deleteDays: number;
  reminderDays: number;
  /** For an account deactivated now: when it would be deleted and when the reminder goes out. */
  deletesOn: string;
  remindsOn: string;
};

/** Shown on the sign-in page after a deactivated customer signs in, before they reactivate. */
export type ReactivationDto = {
  name: string;
  deactivatedOn: string;
  deletesOn: string;
};

/** "January 18, 2027" in Manila time. */
export function longManilaDate(date: Date) {
  return date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });
}
