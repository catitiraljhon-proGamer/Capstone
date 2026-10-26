/** Admin-editable system settings (Maintenance). Shared by the server and the Maintenance page. */

export type SystemSettings = {
  passwordMinLength: number;
  passwordLettersAndNumbers: boolean;
  passwordUpperAndSymbol: boolean;
  loginMaxAttempts: number;
  loginLockMinutes: number;
  idleSignOutMinutes: number;
  signupCodeMinutes: number;
  signupResendSeconds: number;
  signupMaxAttempts: number;
  emailCopiesAdmin: boolean;
  emailCopiesBillingClerk: boolean;
  emailCopiesCustomer: boolean;
  dueReminderDays: number;
  inactiveNoticeDays: number;
  inactiveArchiveDays: number;
  autoBackup: boolean;
  keepAutomaticBackups: number;
  roomBedroomSqm: number;
  roomBathroomSqm: number;
  roomKitchenSqm: number;
  roomLivingSqm: number;
  roomWallsPercent: number;
};

export type SettingKey = keyof SystemSettings;

/** The values the system used before these settings existed, so nothing changes until the Admin edits them. */
export const defaultSystemSettings: SystemSettings = {
  passwordMinLength: 8,
  passwordLettersAndNumbers: false,
  passwordUpperAndSymbol: false,
  loginMaxAttempts: 5,
  loginLockMinutes: 15,
  idleSignOutMinutes: 0,
  signupCodeMinutes: 10,
  signupResendSeconds: 60,
  signupMaxAttempts: 5,
  emailCopiesAdmin: true,
  emailCopiesBillingClerk: true,
  emailCopiesCustomer: true,
  dueReminderDays: 3,
  inactiveNoticeDays: 7,
  inactiveArchiveDays: 30,
  autoBackup: true,
  keepAutomaticBackups: 7,
  // Typical room sizes, larger than the Building Code minimums, so a crowded floor plan gets a warning.
  roomBedroomSqm: 9,
  roomBathroomSqm: 3,
  roomKitchenSqm: 6,
  roomLivingSqm: 12,
  roomWallsPercent: 20,
};

export type NumberSettingField = { kind: "number"; label: string; hint?: string; unit: string; min: number; max: number };
export type ToggleSettingField = { kind: "toggle"; label: string; hint?: string };
export type SettingField = NumberSettingField | ToggleSettingField;

/** Labels, units, and limits for each setting; drives validation, the form, and the audit log. */
export const settingFields: Record<SettingKey, SettingField> = {
  passwordMinLength: { kind: "number", label: "Minimum length", hint: "Applies the next time a password is set.", unit: "characters", min: 8, max: 64 },
  passwordLettersAndNumbers: { kind: "toggle", label: "Letters and numbers" },
  passwordUpperAndSymbol: { kind: "toggle", label: "Uppercase letter and a symbol" },
  loginMaxAttempts: { kind: "number", label: "Lock after", hint: "Wrong passwords in a row before the account is locked.", unit: "tries", min: 3, max: 20 },
  loginLockMinutes: { kind: "number", label: "Lock for", hint: "Repeat lockouts last longer, up to one day.", unit: "minutes", min: 1, max: 1440 },
  idleSignOutMinutes: { kind: "number", label: "Sign out after", hint: "Of no activity. 0 never signs out.", unit: "minutes", min: 0, max: 1440 },
  signupCodeMinutes: { kind: "number", label: "Sign-up code lasts", hint: "The 6-digit code emailed when a client registers.", unit: "minutes", min: 5, max: 60 },
  signupResendSeconds: { kind: "number", label: "Wait before resending", unit: "seconds", min: 30, max: 600 },
  signupMaxAttempts: { kind: "number", label: "Wrong codes allowed", hint: "After this, a new code is needed.", unit: "tries", min: 3, max: 10 },
  emailCopiesAdmin: { kind: "toggle", label: "Admin", hint: "Email a copy of each notification." },
  emailCopiesBillingClerk: { kind: "toggle", label: "Billing Clerk", hint: "Email a copy of each notification." },
  emailCopiesCustomer: { kind: "toggle", label: "Customer", hint: "Email a copy of each notification." },
  dueReminderDays: { kind: "number", label: "Payment due reminder", hint: "Days before an unpaid invoice is due.", unit: "day/s before", min: 1, max: 30 },
  inactiveNoticeDays: { kind: "number", label: "Warn inactive clients", hint: "Days of warning before archiving.", unit: "day/s before", min: 1, max: 60 },
  inactiveArchiveDays: { kind: "number", label: "Archive inactive clients after", hint: "Days with no open work after the last project is completed.", unit: "day/s", min: 7, max: 365 },
  autoBackup: { kind: "toggle", label: "Automatic daily backup" },
  keepAutomaticBackups: { kind: "number", label: "Keep the last", hint: "Older automatic backups are deleted. Manual ones are kept.", unit: "automatic backups", min: 1, max: 30 },
  roomBedroomSqm: { kind: "number", label: "Bedroom", hint: "For each bedroom.", unit: "sqm", min: 1, max: 100 },
  roomBathroomSqm: { kind: "number", label: "Toilet and bath", hint: "For each bathroom.", unit: "sqm", min: 1, max: 100 },
  roomKitchenSqm: { kind: "number", label: "Kitchen", hint: "One per house.", unit: "sqm", min: 1, max: 100 },
  roomLivingSqm: { kind: "number", label: "Living and dining", hint: "One per house.", unit: "sqm", min: 1, max: 200 },
  roomWallsPercent: { kind: "number", label: "Walls and hallways", hint: "Added on top of the rooms.", unit: "percent", min: 0, max: 100 },
};

export const settingKeys = Object.keys(defaultSystemSettings) as SettingKey[];

/** Who last changed a setting and when (ISO time). */
export type SettingChange = { by: string; at: string };

export type SystemSettingsView = {
  settings: SystemSettings;
  changes: Partial<Record<SettingKey, SettingChange>>;
};

export type PasswordPolicy = Pick<SystemSettings, "passwordMinLength" | "passwordLettersAndNumbers" | "passwordUpperAndSymbol">;

/** Room sizes for the floor area warning on design requests and house designs. */
export type RoomSizes = Pick<SystemSettings, "roomBedroomSqm" | "roomBathroomSqm" | "roomKitchenSqm" | "roomLivingSqm" | "roomWallsPercent">;

/**
 * Settings any visitor may read: sign-up forms show the password rules, every page needs the sign-out time,
 * and the design forms need the room sizes.
 */
export type PublicSettings = PasswordPolicy & Pick<SystemSettings, "idleSignOutMinutes"> & RoomSizes;

export const defaultPasswordPolicy: PasswordPolicy = {
  passwordMinLength: defaultSystemSettings.passwordMinLength,
  passwordLettersAndNumbers: defaultSystemSettings.passwordLettersAndNumbers,
  passwordUpperAndSymbol: defaultSystemSettings.passwordUpperAndSymbol,
};

export const defaultRoomSizes: RoomSizes = {
  roomBedroomSqm: defaultSystemSettings.roomBedroomSqm,
  roomBathroomSqm: defaultSystemSettings.roomBathroomSqm,
  roomKitchenSqm: defaultSystemSettings.roomKitchenSqm,
  roomLivingSqm: defaultSystemSettings.roomLivingSqm,
  roomWallsPercent: defaultSystemSettings.roomWallsPercent,
};

/** bcrypt only reads the first 72 bytes of a password. */
export const passwordMaxLength = 72;

export function passwordPolicyError(password: string, policy: PasswordPolicy) {
  if (!password) return "Enter a password.";
  if (password.length < policy.passwordMinLength) return `Password must be at least ${policy.passwordMinLength} characters.`;
  if (password.length > passwordMaxLength) return `Password must be ${passwordMaxLength} characters or fewer.`;
  if (policy.passwordLettersAndNumbers && !(/\p{L}/u.test(password) && /\d/.test(password))) {
    return "Password must include both letters and numbers.";
  }
  if (policy.passwordUpperAndSymbol && !(/\p{Lu}/u.test(password) && /[^\p{L}\d\s]/u.test(password))) {
    return "Password must include an uppercase letter and a symbol.";
  }
  return null;
}

/** One line describing the rules, for hints under password fields. */
export function passwordPolicyHint(policy: PasswordPolicy) {
  const parts = [`At least ${policy.passwordMinLength} characters`];
  if (policy.passwordLettersAndNumbers) parts.push("letters and numbers");
  if (policy.passwordUpperAndSymbol) parts.push("an uppercase letter and a symbol");
  return `${parts.join(", ")}.`;
}

/** Thrown when a new password breaks the Admin's password rules. */
export class PasswordPolicyError extends Error {}
