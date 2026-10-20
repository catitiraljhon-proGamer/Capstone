import type { PaymentDueDto } from "@/types/billing";

export type ScheduleEventType = "Client meeting" | "Payment follow-up";
export type ScheduleStatus = "Scheduled" | "Completed" | "Cancelled";
export type MeetingMode = "In person" | "Online";
export type MeetingRequestStatus = "Pending" | "Approved" | "Declined" | "Cancelled";

export type ScheduleDto = {
  id: string;
  title: string;
  eventType: ScheduleEventType;
  clientId: string;
  clientName: string;
  projectId?: string;
  projectName?: string;
  scheduledFor: string;
  durationMinutes: number;
  location?: string;
  notes?: string;
  status: ScheduleStatus;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

export type MeetingRequestDto = {
  id: string;
  customerId: string;
  customerName: string;
  projectId?: string;
  projectName?: string;
  topic: string;
  details?: string;
  mode: MeetingMode;
  preferredTimes: string[];
  status: MeetingRequestStatus;
  scheduledFor?: string;
  declineReason?: string;
  /** Set when the customer asks to pick up a paid blueprint in person. */
  purpose?: "blueprint-pickup";
  designRequestId?: string;
  createdAt: string;
};

export type ScheduleClientOption = { id: string; name: string; email: string };
export type ScheduleProjectOption = { id: string; clientId: string; reference: string; name: string };

/** Admin: client meetings and pending meeting requests. Billing Clerk: payment follow-ups, with meetings view-only. */
export type StaffScheduleData = {
  schedules: ScheduleDto[];
  meetingRequests: MeetingRequestDto[];
  clients: ScheduleClientOption[];
  projects: ScheduleProjectOption[];
  paymentDues: PaymentDueDto[];
};

/** What a customer sees about their own meetings; staff notes stay internal. */
export type CustomerMeetingDto = Pick<ScheduleDto, "id" | "title" | "projectName" | "scheduledFor" | "durationMinutes" | "location" | "status">;

export type CustomerScheduleData = {
  meetings: CustomerMeetingDto[];
  meetingRequests: MeetingRequestDto[];
  projects: { id: string; reference: string; name: string }[];
  paymentDues: PaymentDueDto[];
};
