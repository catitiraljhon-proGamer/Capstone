import type { UserStatus } from "@/types/domain";

export type ClientDetails = {
  age: number;
  contactNumber: string;
  address: string;
  occupation: string;
};

export type ClientDto = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  contactNumber: string;
  address: string;
  occupation: string;
  status: UserStatus;
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
