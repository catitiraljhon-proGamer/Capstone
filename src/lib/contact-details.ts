/** The office details shown in Contact Us; the Admin edits them in Maintenance. */
export type ContactDetails = {
  phone: string;
  email: string;
  address: string;
};

export type ContactField = keyof ContactDetails;

export const contactFields: ContactField[] = ["phone", "email", "address"];

export const contactFieldLabels: Record<ContactField, string> = {
  phone: "Phone number",
  email: "Email address",
  address: "Office address",
};

/** Used until the Admin saves their own details. */
export const defaultContactDetails: ContactDetails = {
  phone: "(043) 407 3561",
  email: "g4builders2014@gmail.com",
  address: "Dr. Bahia St. ICV Poblacion 3, Balayan, Philippines, 4213",
};

/** Admin view: the saved details with who changed each one last. */
export type ContactDetailsView = {
  contact: ContactDetails;
  changes: Partial<Record<ContactField, { by: string; at: string }>>;
};

/** "(043) 407 3561" dials as tel:+63434073561; numbers written with +63 keep it. */
export function phoneHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (phone.trim().startsWith("+")) return `tel:+${digits}`;
  return digits.startsWith("0") ? `tel:+63${digits.slice(1)}` : `tel:${digits}`;
}

export const mapsHref = (address: string) =>
  `https://www.bing.com/maps/default.aspx?where1=${encodeURIComponent(address)}`;
