/** The G4 team on the About Us page, by profession (Maintenance > About Us). */
export const professionalRoles = ["Architect", "Engineer", "Designer", "Contractor"] as const;
export type ProfessionalRole = (typeof professionalRoles)[number];

/** Photos are cropped square and shrunk to this many pixels on each side before they are saved. */
export const professionalPhotoSize = 480;
/** The photo the Admin picks may be this large; it is much smaller once cropped and shrunk. */
export const maxProfessionalPhotoBytes = 10_000_000;

/** One person as the About Us page shows them. */
export type Professional = {
  id: string;
  /** Written as it should appear, title included: "Arch. Sherwin Macalalad". */
  name: string;
  role: ProfessionalRole;
  specialization: string;
  /** PRC license number, digits only; empty when not given. */
  licenseNumber: string;
  yearsOfExperience: number | null;
  bio: string;
  /** Square photo as a data URL; empty shows the person's initials instead. */
  photo: string;
  /** Published house designs that name this person under Designed By. */
  designCount: number;
};

/** Admin view: hidden people stay in the list but are left off the About Us page. */
export type ManagedProfessional = Professional & { visible: boolean };

/** What the Admin types in the add and edit form. */
export type ProfessionalInput = Omit<ManagedProfessional, "id" | "designCount">;

/** A Published design credited to the person, with its cover photo. */
export type ProfessionalDesign = { designId: string; name: string; image: string };

/** The About Us pop-up shows at most this many of the person's designs. */
export const professionalDesignLimit = 6;

/** "SM" for "Arch. Sherwin Macalalad": the title is skipped, then the first and last names. */
export function professionalInitials(name: string) {
  const words = name.replace(/^(?:arch|ar|engr|eng|archt)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((word) => word[0]).join("").toUpperCase();
}
