export type UserRole = "customer" | "billing-clerk" | "admin";

export type UserStatus = "active" | "disabled";

export type MessageRecipientRole = Exclude<UserRole, "customer">;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type ManagedUserDto = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type UserManagementSummary = {
  total: number;
  active: number;
  customers: number;
  staff: number;
  disabled: number;
};

export const roleLabels: Record<UserRole, string> = {
  customer: "Customer",
  "billing-clerk": "Billing Clerk",
  admin: "Admin",
};

export const roleHomePaths: Record<UserRole, string> = {
  customer: "/customer",
  "billing-clerk": "/billing-clerk",
  admin: "/admin",
};

export type MessageDto = {
  id: string;
  customerId: string;
  recipientRole: MessageRecipientRole;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  body: string;
  createdAt: string;
};

export type MessageConversationDto = {
  customerId: string;
  customerName: string;
  recipientRole: MessageRecipientRole;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastAuthorName: string;
  lastAuthorRole: UserRole;
  unreadCount: number;
};
