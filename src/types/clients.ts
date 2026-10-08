import type { UserStatus } from "@/types/domain";

/** Structured Philippine address chosen from the PSGC province, city, and barangay lists. */
export type AddressDetails = {
  provinceCode: string;
  province: string;
  cityCode: string;
  city: string;
  barangayCode: string;
  barangay: string;
  street: string;
  postalCode: string;
};

export type ClientDetails = {
  age: number;
  contactNumber: string;
  /** Full address line; built from addressDetails for records saved with the dropdowns. */
  address: string;
  occupation: string;
  /** Missing on records saved before the address dropdowns existed. */
  addressDetails?: AddressDetails;
};

export type ClientDto = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  contactNumber: string;
  address: string;
  addressDetails: AddressDetails | null;
  occupation: string;
  status: UserStatus;
  archivedAt: string | null;
  profileComplete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ClientListPayload = {
  clients: ClientDto[];
  total: number;
  page: number;
  pageSize: number;
};
