/** Self-registration accepts Gmail addresses only. Shared by the form and the API. */
export const gmailAddressMessage = "Use a Gmail address that ends in @gmail.com.";

export function isGmailAddress(email: string) {
  return /^[^\s@]+@gmail\.com$/i.test(email.trim());
}
