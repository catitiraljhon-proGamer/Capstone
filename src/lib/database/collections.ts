import type {
  CustomExteriorItem,
  ExteriorItemChoice,
  HouseDesignFinish,
  HouseDesignStatus,
  HouseType,
} from "@/components/ui/house-design-data";
import type {
  MessageRecipientRole,
  UserRole,
  UserStatus,
} from "@/types/domain";
import type {
  ApprovalRecordType,
  ApprovalStatus,
} from "@/types/approvals";
import type { ObjectId } from "mongodb";
import type { ClientDetails } from "@/types/clients";

export const collections = {
  users: "users",
  houseDesigns: "house_designs",
  houseTypes: "house_types",
  exteriorItems: "exterior_items",
  referenceValues: "reference_values",
  messages: "messages",
  projects: "projects",
  designRequests: "design_requests",
  estimates: "cost_estimates",
  approvals: "approvals",
  invoices: "invoices",
  payments: "payments",
  documents: "documents",
  notifications: "notifications",
  schedules: "schedules",
  auditLogs: "audit_logs",
} as const;

export type UserDocument = {
  _id: ObjectId;
  email: string;
  passwordHash?: string;
  googleSub?: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  authVersion?: number;
  clientDetails?: ClientDetails;
  createdAt: Date;
  updatedAt: Date;
};

export type HouseDesignDocument = {
  _id: ObjectId;
  name: string;
  style?: string;
  houseType: string;
  finish: HouseDesignFinish;
  area: number;
  rooms: string;
  rate: number;
  images: string[];
  notes: string;
  status: HouseDesignStatus;
  defaultSelections: number[];
  customItems: CustomExteriorItem[];
  createdAt: Date;
  createdBy: ObjectId;
  createdByName: string;
  updatedAt: Date;
};

export type HouseTypeDocument = HouseType & {
  _id: ObjectId;
  order: number;
  active: boolean;
};

export type ExteriorItemDocument = ExteriorItemChoice & {
  _id: ObjectId;
  order: number;
  active: boolean;
};

export type ReferenceValueDocument = {
  _id: ObjectId;
  category: string;
  value: string;
  order: number;
  active: boolean;
};

export type MessageDocument = {
  _id: ObjectId;
  conversationKey: string;
  customerId: ObjectId;
  /** Missing only on legacy messages, which are treated as Admin conversations. */
  recipientRole?: MessageRecipientRole;
  authorId: ObjectId;
  authorName: string;
  authorRole: UserRole;
  body: string;
  createdAt: Date;
  /** Staff members who have opened this customer message. */
  readByStaffIds?: ObjectId[];
};

export type ProjectStatus = "Pending" | "Active" | "On hold" | "Completed";

export type ProjectDocument = {
  _id: ObjectId;
  reference: string;
  customerId: ObjectId;
  houseDesignId?: ObjectId;
  name: string;
  status: ProjectStatus;
  contractPrice: number;
  startDate?: Date;
  targetCompletionDate?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type DesignRequestDocument = {
  _id: ObjectId;
  customerId: ObjectId;
  projectId?: ObjectId;
  houseDesignId?: ObjectId;
  floorArea: number;
  rooms: string;
  finish: HouseDesignFinish;
  notes: string;
  inspirationImages?: string[];
  /** Legacy single-image field retained for existing records. */
  inspirationImage?: string;
  completedDesignImages?: string[];
  /** Legacy single-image field retained for existing records. */
  completedDesignImage?: string;
  status: "Pending" | "In review" | "Approved" | "Rejected" | "Completed";
  completedAt?: Date;
  completedBy?: ObjectId;
  completedByName?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type EstimateDocument = {
  _id: ObjectId;
  reference: string;
  customerId: ObjectId;
  projectId?: ObjectId;
  houseDesignId: ObjectId;
  baseEstimate: number;
  exteriorTotal: number;
  total: number;
  status: "Draft" | "Pending" | "Approved" | "Rejected";
  createdAt: Date;
  updatedAt: Date;
};

export type ApprovalDocument = {
  _id: ObjectId;
  reference: string;
  customerId: ObjectId;
  recordType: ApprovalRecordType;
  recordId: ObjectId;
  status: ApprovalStatus;
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: ObjectId;
  reviewNote?: string;
};

export type InvoiceStatus = "Draft" | "Ready" | "Sent" | "Paid" | "Overdue";

export type InvoiceDocument = {
  _id: ObjectId;
  invoiceNumber: string;
  customerId: ObjectId;
  projectId: ObjectId;
  label: string;
  progressPercentage: number;
  amount: number;
  dueDate: Date;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentDocument = {
  _id: ObjectId;
  reference: string;
  customerId: ObjectId;
  projectId: ObjectId;
  invoiceId?: ObjectId;
  amount: number;
  method: "Cash" | "Bank transfer" | "Card" | "E-wallet" | "Check";
  status: "Pending" | "Verified" | "Rejected";
  paidAt: Date;
  createdAt: Date;
  verifiedAt?: Date;
  verifiedBy?: ObjectId;
};

export type DocumentRecord = {
  _id: ObjectId;
  customerId: ObjectId;
  projectId?: ObjectId;
  name: string;
  category: string;
  url: string;
  uploadedBy: ObjectId;
  createdAt: Date;
};

export type NotificationDocument = {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  body: string;
  href?: string;
  kind?: string;
  entityId?: ObjectId;
  readAt?: Date;
  createdAt: Date;
};

export type ScheduleEventType =
  | "Client meeting"
  | "Payment follow-up"
  | "Payment due";

export type ScheduleStatus = "Scheduled" | "Completed" | "Cancelled";

export type PaymentScheduleStatus =
  | "Not applicable"
  | "Expected"
  | "Pending"
  | "Paid"
  | "Overdue";

export type ScheduleDocument = {
  _id: ObjectId;
  title: string;
  eventType: ScheduleEventType;
  clientId: ObjectId;
  clientName: string;
  projectId?: ObjectId;
  projectName?: string;
  scheduledFor: Date;
  durationMinutes: number;
  location?: string;
  notes?: string;
  status: ScheduleStatus;
  paymentStatus: PaymentScheduleStatus;
  expectedAmount?: number;
  createdBy: ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AuditLogDocument = {
  _id: ObjectId;
  actorId: ObjectId;
  actorName: string;
  /** Stored on new records; older records are enriched from the users collection. */
  actorRole?: UserRole;
  action: string;
  entityType: string;
  entityId?: ObjectId;
  details?: Record<string, string | number | boolean | null>;
  createdAt: Date;
};
