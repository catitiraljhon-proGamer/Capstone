import { formatPeso } from "@/lib/house-design-data";

/**
 * Client-side field checks shared by every form, so messages read the same
 * across billing, payments, estimates, and design requests. Each returns an
 * error message for the field, or null when the value is valid. The server
 * still validates everything; these exist so people see why a value is wrong
 * before submitting.
 */

type AmountRules = {
  /** Field name used in messages, e.g. "Amount". */
  label?: string;
  required?: boolean;
  /** Inclusive minimum. */
  min?: number;
  /** Inclusive maximum. */
  max?: number;
  /** Explains the maximum, e.g. "the remaining balance". */
  maxLabel?: string;
  /** Explains the minimum, e.g. "the minimum online payment". */
  minLabel?: string;
  /** Allow 0 (prices); otherwise amounts must be greater than 0. */
  allowZero?: boolean;
};

const decimals = (raw: string) => (raw.includes(".") ? raw.split(".")[1].length : 0);

/** Peso amounts: positive, at most 2 decimal places, within min/max. */
export function amountError(raw: string, { label = "Amount", required = true, min, max, maxLabel, minLabel, allowZero = false }: AmountRules = {}) {
  const text = raw.trim();
  if (!text) return required ? `Enter the ${label.toLowerCase()}.` : null;
  const value = Number(text);
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (value < 0) return `${label} cannot be negative.`;
  if (!allowZero && value === 0) return `${label} must be more than ₱0.`;
  if (decimals(text) > 2) return `${label} can have at most 2 decimal places (centavos).`;
  if (min !== undefined && value < min) return `${label} must be at least ${formatPeso(min)}${minLabel ? ` (${minLabel})` : ""}.`;
  if (max !== undefined && value > max) return `${label} cannot be more than ${formatPeso(max)}${maxLabel ? ` (${maxLabel})` : ""}.`;
  return null;
}

type NumberRules = {
  label: string;
  required?: boolean;
  min?: number;
  max?: number;
  /** Whole numbers only (rooms, quantities counted in units). */
  integer?: boolean;
  /** Maximum decimal places when not an integer. */
  maxDecimals?: number;
  /** Unit appended to min/max in messages, e.g. "%" or " sq m". */
  unit?: string;
};

/** Plain numbers such as percentages, quantities, floor areas, and room counts. */
export function numberError(raw: string, { label, required = true, min, max, integer = false, maxDecimals, unit = "" }: NumberRules) {
  const text = raw.trim();
  if (!text) return required ? `Enter the ${label.toLowerCase()}.` : null;
  const value = Number(text);
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (integer && !Number.isInteger(value)) return `${label} must be a whole number.`;
  if (!integer && maxDecimals !== undefined && decimals(text) > maxDecimals) return `${label} can have at most ${maxDecimals} decimal place${maxDecimals === 1 ? "" : "s"}.`;
  if (min !== undefined && value < min) return `${label} must be at least ${min}${unit}.`;
  if (max !== undefined && value > max) return `${label} cannot be more than ${max}${unit}.`;
  return null;
}

type DateRules = {
  label: string;
  required?: boolean;
  /** Inclusive earliest YYYY-MM-DD. */
  min?: string;
  /** Inclusive latest YYYY-MM-DD. */
  max?: string;
  minLabel?: string;
  maxLabel?: string;
};

const readableDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

/** YYYY-MM-DD dates from date inputs. */
export function dateError(raw: string, { label, required = true, min, max, minLabel, maxLabel }: DateRules) {
  if (!raw) return required ? `Choose the ${label.toLowerCase()}.` : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) return `${label} is not a valid date.`;
  if (min && raw < min) return `${label} must be on or after ${minLabel ?? readableDate(min)}.`;
  if (max && raw > max) return `${label} must be on or before ${maxLabel ?? readableDate(max)}.`;
  return null;
}

/** Required free text with a length range. */
export function textError(raw: string, { label, required = true, min = 1, max }: { label: string; required?: boolean; min?: number; max?: number }) {
  const text = raw.trim();
  if (!text) return required ? `Enter the ${label.toLowerCase()}.` : null;
  if (text.length < min) return `${label} must be at least ${min} characters.`;
  if (max !== undefined && text.length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

/** Today in Manila as YYYY-MM-DD, offset by whole days. */
export function manilaDay(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
