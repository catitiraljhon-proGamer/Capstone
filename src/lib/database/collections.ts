import type {
  CustomExteriorItem,
  ExteriorItemChoice,
  FinishLevel,
  HouseDesignStatus,
  HouseType,
} from "@/lib/house-design-data";
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
import type { AddressDetails, ClientDetails } from "@/types/clients";
import type { ReceiptSnapshot, StoredPaymentMethod } from "@/types/billing";
import type { DesignRequestStatus, RequestedHouseDesign } from "@/types/design-requests";
import type { EstimateStatus, MilestoneTemplate, ProjectStatus } from "@/types/construction";
import type { CheckoutStatus, PaymongoMethod } from "@/types/paymongo";
import type { MeetingMode, MeetingRequestStatus } from "@/types/schedules";
import type { SettingKey, SystemSettings } from "@/lib/system-settings";
import type { ContactDetails, ContactField } from "@/lib/contact-details";
import type { AccountTermsContent } from "@/lib/account-terms";
import type { ProfessionalRole } from "@/lib/professionals";
import type { AboutUsContent } from "@/lib/about-us";

export type { ProjectStatus } from "@/types/construction";

export const collections = {
  users: "users",
  houseDesigns: "house_designs",
  houseTypes: "house_types",
  exteriorItems: "exterior_items",
  messages: "messages",
  projects: "projects",
  designRequests: "design_requests",
  designVersions: "design_versions",
  blueprintFiles: "blueprint_files",
  estimates: "cost_estimates",
  approvals: "approvals",
  invoices: "invoices",
  payments: "payments",
  paymentCheckouts: "payment_checkouts",
  cashReports: "cash_reports",
  documents: "documents",
  notifications: "notifications",
  schedules: "schedules",
  meetingRequests: "meeting_requests",
  auditLogs: "audit_logs",
  systemSettings: "system_settings",
  rateLimits: "rate_limits",
  emailVerifications: "email_verifications",
  backupUploads: "backup_uploads",
  professionals: "professionals",
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
  clientArchivedAt?: Date | null;
  /** Set when the client was archived and disabled automatically after 30 days of inactivity. */
  autoArchivedAt?: Date;
  /** Start of the inactivity period the 7-day "account will be archived" notice was sent for, so it is sent once. */
  inactivityNoticeFor?: Date;
  /** When that notice went out; archiving waits at least 7 days after it. */
  inactivityNoticeSentAt?: Date;
  /** When an admin last unarchived the client; the 30-day inactivity count restarts from here. */
  reactivatedAt?: Date;
  /** Customer's one-time agreement to the Terms and Conditions; the audit log keeps the exact text. */
  termsAcceptance?: { auditLogId: ObjectId; version: string; acceptedAt: Date };
  createdAt: Date;
  updatedAt: Date;
};

/** Failed-attempt counters for login and registration throttling. */
export type RateLimitDocument = {
  _id: string;
  failures: number;
  windowStartedAt: Date;
  lockouts: number;
  lockedUntil?: Date | null;
  expiresAt: Date;
};

/** One pending registration code per email address; the code itself is stored hashed. */
export type EmailVerificationDocument = {
  _id: string;
  codeHash: string;
  attempts: number;
  sentAt: Date;
  expiresAt: Date;
};

export type HouseDesignDocument = {
  _id: ObjectId;
  name: string;
  style?: string;
  /** Missing on designs saved while house types were turned off. */
  houseType?: string;
  area: number;
  /** Missing on designs saved before the counts had their own fields; read from `rooms` instead. */
  bedrooms?: number;
  bathrooms?: number;
  rooms: string;
  rate: number;
  images: string[];
  notes: string;
  status: HouseDesignStatus;
  customItems: CustomExteriorItem[];
  /** The architect or engineer the design is credited to on the About Us page. */
  designedBy?: ObjectId;
  /** The completed project this design was created from, with a snapshot of its accepted estimate. */
  sourceProject?: {
    projectId: ObjectId;
    projectReference: string;
    estimateReference?: string;
    customerName: string;
    contractPrice: number;
    subtotal: number;
    completedAt: Date;
    lineItems: EstimateLineItemDocument[];
  };
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

/** One payment-schedule row saved on a project when the customer accepts its estimate. */
export type ProjectMilestoneDocument = {
  id: string;
  label: string;
  description: string;
  percentage: number;
  amount: number;
  targetDate: Date;
  isDownpayment: boolean;
  /** The current non-void invoice billed for this milestone. */
  invoiceId?: ObjectId;
};

export type ProjectDocument = {
  _id: ObjectId;
  reference: string;
  customerId: ObjectId;
  houseDesignId?: ObjectId;
  name: string;
  status: ProjectStatus;
  contractPrice: number;
  billingVersion?: number;
  startDate?: Date;
  /** The customer's "Needed By" date from the construction request. */
  targetCompletionDate?: Date;
  estimateId?: ObjectId;
  designRequestId?: ObjectId;
  subtotal?: number;
  /** Legacy: VAT on projects billed before G4 Builders became VAT-exempt. */
  vat?: number;
  downpaymentPercent?: number;
  paymentSchedule?: ProjectMilestoneDocument[];
  /** When the admin marked the project Completed; older completed projects fall back to updatedAt. */
  completedAt?: Date;
  /** When the draft design made from this completed project was removed, so it is not recreated. */
  completedDesignRemovedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type DesignRequestDocument = {
  _id: ObjectId;
  customerId: ObjectId;
  projectId?: ObjectId;
  houseDesignId?: ObjectId;
  /** Snapshot of the published design explicitly chosen by the customer. */
  selectedDesign?: RequestedHouseDesign;
  /** House type (category) the finished design is filed under; missing on older requests. */
  houseType?: string;
  /** Finish level the customer expects; only on custom requests made after it returned. */
  finish?: FinishLevel;
  floorArea: number;
  /** Older requests only have a free-text rooms summary. */
  bedrooms?: number;
  bathrooms?: number;
  rooms: string;
  notes: string;
  /** Timespan for the design; missing on requests made before it was required. */
  preferredDate?: Date;
  neededBy?: Date;
  inspirationImages?: string[];
  /** Legacy single-image field retained for existing records. */
  inspirationImage?: string;
  completedDesignImages?: string[];
  /** Legacy single-image field retained for existing records. */
  completedDesignImage?: string;
  /**
   * Blueprint workflow: Approved (feasible, design in progress) → In customer review ⇄ Changes requested
   * → Design approved. "Completed" marks legacy requests delivered under the old design-fee flow.
   */
  status: DesignRequestStatus;
  /** Latest design version uploaded for customer review. */
  currentVersion?: number;
  /** When the admin submitted the finished blueprint to the Billing Clerk; the files are locked from then on. */
  blueprintSubmittedAt?: Date;
  blueprintSubmittedBy?: ObjectId;
  designApprovedAt?: Date;
  completedAt?: Date;
  completedBy?: ObjectId;
  completedByName?: string;
  /** Recorded acknowledgment for new requests; legacy requests may not have one. */
  termsAcceptance?: {
    auditLogId: ObjectId;
    version: string;
    acceptedAt: Date;
  };
  billingVersion?: number;
  createdAt: Date;
  updatedAt: Date;
};

/** One round of design and floor plan images the admin sends for the customer's review. */
export type DesignVersionDocument = {
  _id: ObjectId;
  designRequestId: ObjectId;
  customerId: ObjectId;
  version: number;
  images: string[];
  adminNote: string;
  createdBy: ObjectId;
  createdByName: string;
  createdAt: Date;
  /** The customer's answer to this version; missing while it awaits review. */
  response?: { decision: "approved" | "changes"; note: string; respondedAt: Date };
};

/** A blueprint file, stored one per document so PDFs stay within MongoDB's document limit. */
export type BlueprintFileDocument = {
  _id: ObjectId;
  designRequestId: ObjectId;
  customerId: ObjectId;
  name: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  size: number;
  /** Base64 file content without the data URL prefix. */
  data: string;
  createdBy: ObjectId;
  createdByName: string;
  createdAt: Date;
};

export type EstimateLineItemDocument = {
  id: string;
  item: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

/**
 * A construction cost estimate. It starts as the customer's construction
 * request ("Requested"), the admin builds the BOQ and schedule, and the
 * customer accepts it to create the project.
 */
export type EstimateDocument = {
  _id: ObjectId;
  reference: string;
  customerId: ObjectId;
  projectId?: ObjectId;
  houseDesignId?: ObjectId;
  designRequestId?: ObjectId;
  preferredStartDate?: Date;
  neededBy?: Date;
  siteAddress?: string;
  siteAddressDetails?: AddressDetails;
  customerNotes?: string;
  lineItems?: EstimateLineItemDocument[];
  subtotal?: number;
  /** Legacy: VAT saved before G4 Builders became VAT-exempt; removed by vat-cleanup unless already billed. */
  vatRate?: number;
  vat?: number;
  total: number;
  scheduleTemplate?: MilestoneTemplate[];
  adminNotes?: string;
  revisionNote?: string;
  sentAt?: Date;
  sentBy?: ObjectId;
  acceptedAt?: Date;
  downpaymentPercent?: number;
  /** Legacy totals from estimates created before the BOQ workflow. */
  baseEstimate?: number;
  exteriorTotal?: number;
  /** "Pending", "Approved", and "Rejected" are legacy approval-queue statuses. */
  status: EstimateStatus | "Pending" | "Approved" | "Rejected";
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

export type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Overdue" | "Void";

export type InvoiceDocument = {
  _id: ObjectId;
  invoiceNumber: string;
  customerId: ObjectId;
  projectId?: ObjectId;
  /** Design and blueprint fees are separate from the construction contract. */
  designRequestId?: ObjectId;
  /** "blueprint" for blueprint fees; legacy design-fee invoices have no value. */
  feeType?: "blueprint";
  /** Payment-schedule row this invoice bills, for projects created from an estimate. */
  milestoneId?: string;
  label: string;
  progressPercentage: number;
  amount: number;
  dueDate: Date;
  status: InvoiceStatus;
  basis?: string;
  issuedAt?: Date;
  issuedBy?: ObjectId;
  voidReason?: string;
  voidedAt?: Date;
  billingVersion?: number;
  lastReminderAt?: Date;
  /** Due date (YYYY-MM-DD) the automatic "payment due soon" reminder was sent for; a new due date gets a new reminder. */
  dueReminderSentFor?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentDocument = {
  _id: ObjectId;
  reference: string;
  customerId: ObjectId;
  projectId?: ObjectId;
  invoiceId?: ObjectId;
  amount: number;
  method: StoredPaymentMethod;
  status: "Pending" | "Verified" | "Rejected" | "Reversed";
  paidAt: Date;
  createdAt: Date;
  verifiedAt?: Date;
  verifiedBy?: ObjectId;
  transactionReference?: string;
  duplicateKey?: string;
  submissionKey?: string;
  proofImage?: string;
  notes?: string;
  reviewNote?: string;
  reviewedAt?: Date;
  reviewedByName?: string;
  reversedAt?: Date;
  reversedByName?: string;
  reversalReason?: string;
  receipt?: ReceiptSnapshot;
  /** Set for online payments received through the (simulated) PayMongo gateway. */
  gateway?: "paymongo";
  gatewayMethod?: PaymongoMethod;
  gatewaySessionId?: string;
  /** False for simulated/test-mode gateway payments. */
  gatewayLivemode?: boolean;
  /** Set on cash the Billing Clerk records (verifiedBy is that clerk) until it is counted in a daily cash report. */
  uncountedCash?: true;
  /** The daily cash report that counted this cash payment. */
  cashReportId?: ObjectId;
};

/** The Billing Clerk's counted cash total for the cash recorded since their last report, verified by the Admin. */
export type CashReportDocument = {
  _id: ObjectId;
  reference: string;
  clerkId: ObjectId;
  clerkName: string;
  /** Manila date (YYYY-MM-DD) the cash was counted. */
  businessDate: string;
  /** Every cash payment the report covers, voided ones included; only verified ones count toward `expected`. */
  paymentIds: ObjectId[];
  expected: number;
  counted: number;
  /** Required when the counted cash differs from the expected cash. */
  explanation?: string;
  status: "Pending" | "Verified";
  submittedAt: Date;
  verifiedAt?: Date;
  verifiedBy?: ObjectId;
  verifiedByName?: string;
  /** The Admin's note, required when the counted cash differs from the expected cash. */
  adminNote?: string;
};

/** A PayMongo-style checkout session for paying one invoice online. */
export type PaymentCheckoutDocument = {
  _id: ObjectId;
  sessionId: string;
  customerId: ObjectId;
  invoiceId: ObjectId;
  amount: number;
  description: string;
  returnPath: string;
  status: CheckoutStatus;
  method?: PaymongoMethod;
  /** PayMongo payment id, also stored as the PaymentDocument's transactionReference. */
  paymentId?: string;
  billingPaymentId?: ObjectId;
  heldForReview?: boolean;
  failureReason?: string;
  /** Ids of webhook events already processed, so redelivered events are ignored. */
  processedEventIds: string[];
  livemode: false;
  expiresAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  /** Set when the recipient's email copy is claimed for sending, so it is sent once. */
  emailedAt?: Date;
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
  /** Payment-schedule row a "Payment due" event tracks, for projects created from an estimate. */
  milestoneId?: string;
  createdBy: ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

/** A customer's request for a meeting; the admin approves it into a "Client meeting" schedule or declines it. */
export type MeetingRequestDocument = {
  _id: ObjectId;
  customerId: ObjectId;
  customerName: string;
  projectId?: ObjectId;
  projectName?: string;
  topic: string;
  details?: string;
  mode: MeetingMode;
  /** Set when the customer asks to pick up a paid blueprint in person. */
  purpose?: "blueprint-pickup";
  designRequestId?: ObjectId;
  /** One to three times the customer can attend, in order of preference. */
  preferredTimes: Date[];
  status: MeetingRequestStatus;
  /** The meeting created on approval. */
  scheduleId?: ObjectId;
  scheduledFor?: Date;
  declineReason?: string;
  reviewedBy?: ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

/** Maintenance mode: customers and the Billing Clerk are locked out until `endsAt`. */
/** The Admin's system settings (Maintenance); missing values use the defaults in lib/system-settings. */
export type SystemSettingsDocument = {
  _id: "system";
  values: Partial<SystemSettings>;
  changes: Partial<Record<SettingKey, { by: string; at: Date }>>;
  updatedAt: Date;
};

/** The Contact Us details (Maintenance > Contact Us); missing values use lib/contact-details defaults. */
export type ContactDetailsDocument = {
  _id: "contact";
  values: Partial<ContactDetails>;
  changes: Partial<Record<ContactField, { by: string; at: Date }>>;
  updatedAt: Date;
};

/** Terms and Conditions versions the Admin published (Maintenance > Terms and Conditions); none yet means the built-in terms. */
export type TermsDocument = {
  _id: "terms";
  /** Oldest first; the last one is current. A published version is never changed. */
  versions: { terms: AccountTermsContent; publishedById: ObjectId; publishedBy: string; publishedAt: Date }[];
  updatedAt: Date;
};

/** The designs the Admin picked for the home page slideshow, in order (Maintenance > Home Page Slideshow). */
export type HomeSlideshowDocument = {
  _id: "home-slideshow";
  designIds: ObjectId[];
  changedBy: string;
  updatedAt: Date;
};

/** An architect or engineer on the About Us page, in the Admin's order (Maintenance > Architects and Engineers). */
export type ProfessionalDocument = {
  _id: ObjectId;
  name: string;
  role: ProfessionalRole;
  specialization: string;
  licenseNumber: string;
  yearsOfExperience: number | null;
  bio: string;
  photo: string;
  visible: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

/** The About Us page text the Admin saved (Maintenance > About Us); none yet means the built-in text. */
export type AboutUsDocument = {
  _id: "about-us";
  content: AboutUsContent;
  changedBy: string;
  updatedAt: Date;
};

/** Written once the starting architects and engineers were added, so a list the Admin emptied stays empty. */
export type ProfessionalsSeedDocument = {
  _id: "professionals-seeded";
  seededAt: Date;
};

export type MaintenanceModeDocument = {
  _id: "maintenance-mode";
  endsAt: Date;
  message?: string;
  startedAt: Date;
  startedById: ObjectId;
  startedByName: string;
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
