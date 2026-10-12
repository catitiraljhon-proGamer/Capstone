/**
 * Philippine mobile numbers, shared by the client forms and the server.
 * Accepted: 11 digits starting with 09 (0917 123 4567) or +63 followed by
 * 10 digits starting with 9 (+63 917 123 4567). Spaces and hyphens are allowed.
 */

export const phContactNumberExample = "0917 123 4567 or +63 917 123 4567";
/** Longest accepted entry, "+63 917-123-4567" with separators. */
export const phContactNumberMaxLength = 16;

/** Drops characters that can never be part of a number: anything except digits, spaces, hyphens, and one leading +. */
export function sanitizePhContactNumberInput(raw: string) {
  const leadingPlus = raw.trimStart().startsWith("+");
  const body = raw.replace(/[^0-9 -]/g, "");
  return (leadingPlus ? `+${body.trimStart()}` : body).slice(0, phContactNumberMaxLength);
}

/** Returns a message describing what is wrong, or null when the number is valid. */
export function phContactNumberError(raw: string): string | null {
  const text = raw.trim();
  if (!text) return "Enter the contact number.";
  if (!/^\+?[0-9 -]+$/.test(text)) {
    return `Use numbers only, for example ${phContactNumberExample}.`;
  }
  const digits = text.replace(/\D/g, "");

  if (text.startsWith("+")) {
    if (!digits.startsWith("63")) {
      return "Only Philippine numbers are accepted. Start with +63 or 09.";
    }
    const local = digits.slice(2);
    if (local && !local.startsWith("9")) {
      return "Enter a mobile number: after +63 it starts with 9, for example +63 917 123 4567.";
    }
    if (local.length !== 10) {
      return `Enter 10 digits after +63 (you entered ${local.length}), for example +63 917 123 4567.`;
    }
    return null;
  }

  if (!digits.startsWith("09")) {
    return `Start the number with 09 or +63, for example ${phContactNumberExample}.`;
  }
  if (digits.length !== 11) {
    return `Enter 11 digits (you entered ${digits.length}), for example 0917 123 4567.`;
  }
  return null;
}

/** Formats a valid number as "+63 917 123 4567" so every record is stored the same way. */
export function formatPhContactNumber(raw: string) {
  const local = raw.replace(/\D/g, "").replace(/^(63|0)/, "");
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}
