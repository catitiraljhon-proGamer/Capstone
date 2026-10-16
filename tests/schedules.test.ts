import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import type { InvoiceDocument, ProjectDocument, UserDocument } from "@/lib/database/collections";
import { BillingError } from "@/lib/server/billing";
import { createSchedule, getCustomerSchedule, getStaffSchedule, requestMeeting, reviewMeetingRequest, updateScheduleStatus } from "@/lib/server/schedules";
import type { SessionUser } from "@/types/domain";

let mongo: MongoMemoryReplSet;
let db: Db;
const admin: SessionUser = { id: new ObjectId().toHexString(), name: "Admin", email: "admin@example.test", role: "admin" };
const clerk: SessionUser = { id: new ObjectId().toHexString(), name: "Billing Clerk", email: "clerk@example.test", role: "billing-clerk" };
const customer: SessionUser = { id: new ObjectId().toHexString(), name: "Test Customer", email: "customer@example.test", role: "customer" };
const other: SessionUser = { id: new ObjectId().toHexString(), name: "Other Customer", email: "other@example.test", role: "customer" };
const projectId = new ObjectId();
const isError = (status: number) => (error: unknown) => error instanceof BillingError && error.status === status;

// Saturday, October 17, 2026, 8:00 AM in Manila.
const now = new Date("2026-10-17T00:00:00.000Z");
const mondayTen = "2026-10-19T02:00:00.000Z"; // Monday 10:00 AM Manila
const mondayTwo = "2026-10-19T06:00:00.000Z"; // Monday 2:00 PM Manila
const request = (extra: Record<string, unknown> = {}) => ({ topic: "Discuss floor plan changes", mode: "In person", preferredTimes: [mondayTen, mondayTwo], ...extra });
const notificationsFor = (actor: SessionUser) => db.collection("notifications").find({ userId: new ObjectId(actor.id) }).toArray();

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_schedule_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_schedule_tests");
  await Promise.all(["users", "projects", "invoices", "payments", "schedules", "meeting_requests", "audit_logs", "notifications"].map((name) => db.collection(name).deleteMany({})));
  const created = new Date();
  await db.collection<UserDocument>("users").insertMany([admin, clerk, customer, other].map((actor) => ({
    _id: new ObjectId(actor.id), name: actor.name, email: actor.email, role: actor.role, status: "active", createdAt: created, updatedAt: created,
  })));
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-001", name: "Test residence", customerId: new ObjectId(customer.id),
    status: "Active", contractPrice: 200000, createdAt: created, updatedAt: created,
  });
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

test("a customer's meeting request reaches the admins, and only office-hour times at least a day ahead are accepted", async () => {
  const sent = await requestMeeting(db, customer, request({ projectId: projectId.toHexString() }), now);
  assert.equal(sent.status, "Pending");
  assert.equal(sent.projectName, "PRJ-001 · Test residence");
  assert.deepEqual(sent.preferredTimes, [mondayTen, mondayTwo]);
  const [adminNotice] = await notificationsFor(admin);
  assert.equal(adminNotice.title, "New meeting request");
  assert.equal(adminNotice.href, "/admin/scheduling");

  await assert.rejects(requestMeeting(db, customer, request({ preferredTimes: ["2026-10-17T06:00:00.000Z"] }), now), isError(400)); // today
  await assert.rejects(requestMeeting(db, customer, request({ preferredTimes: ["2026-10-18T02:00:00.000Z"] }), now), isError(400)); // Sunday
  await assert.rejects(requestMeeting(db, customer, request({ preferredTimes: ["2026-10-19T10:00:00.000Z"] }), now), isError(400)); // 6:00 PM
  await assert.rejects(requestMeeting(db, customer, request({ preferredTimes: [mondayTen, mondayTen] }), now), isError(400));
  await assert.rejects(requestMeeting(db, customer, request({ projectId: new ObjectId().toHexString() }), now), isError(400));
  await assert.rejects(requestMeeting(db, admin, request(), now), isError(403));

  // At most three requests can wait at once.
  await requestMeeting(db, customer, request(), now);
  await requestMeeting(db, customer, request(), now);
  await assert.rejects(requestMeeting(db, customer, request(), now), isError(409));
});

test("only the customer who asked can cancel a pending request", async () => {
  const sent = await requestMeeting(db, customer, request(), now);
  await assert.rejects(reviewMeetingRequest(db, other, sent.id, { action: "cancel" }, now), isError(409));
  await assert.rejects(reviewMeetingRequest(db, admin, sent.id, { action: "cancel" }, now), isError(403));
  const { request: cancelled } = await reviewMeetingRequest(db, customer, sent.id, { action: "cancel" }, now);
  assert.equal(cancelled.status, "Cancelled");
  await assert.rejects(reviewMeetingRequest(db, admin, sent.id, { action: "approve", scheduledFor: mondayTen, durationMinutes: 60 }, now), isError(409));
});

test("approving a request schedules the meeting once, notifies the customer, and blocks overlapping meetings", async () => {
  const sent = await requestMeeting(db, customer, request(), now);
  await assert.rejects(reviewMeetingRequest(db, clerk, sent.id, { action: "approve", scheduledFor: mondayTen, durationMinutes: 60 }, now), isError(403));
  const result = await reviewMeetingRequest(db, admin, sent.id, { action: "approve", scheduledFor: mondayTen, durationMinutes: 60 }, now);
  assert.equal(result.request.status, "Approved");
  assert.equal(result.request.scheduledFor, mondayTen);
  assert.ok("schedule" in result && result.schedule);
  assert.equal(result.schedule.eventType, "Client meeting");
  assert.equal(result.schedule.location, "G4 Builders Inc office");
  const [notice] = await notificationsFor(customer);
  assert.equal(notice.title, "Meeting request approved");
  assert.equal(notice.href, "/customer/schedule");

  // Answering twice does nothing.
  await assert.rejects(reviewMeetingRequest(db, admin, sent.id, { action: "approve", scheduledFor: mondayTwo, durationMinutes: 60 }, now), isError(409));

  // Another client asks for an overlapping time; the admin must choose another.
  const second = await requestMeeting(db, other, request({ mode: "Online", preferredTimes: ["2026-10-19T02:30:00.000Z"] }), now);
  await assert.rejects(reviewMeetingRequest(db, admin, second.id, { action: "approve", scheduledFor: "2026-10-19T02:30:00.000Z", durationMinutes: 60 }, now), isError(409));
  const moved = await reviewMeetingRequest(db, admin, second.id, { action: "approve", scheduledFor: "2026-10-20T03:00:00.000Z", durationMinutes: 60, location: "https://meet.example.test/g4" }, now);
  assert.equal(moved.request.status, "Approved");
  const [movedNotice] = await notificationsFor(other);
  assert.equal(movedNotice.title, "Meeting set for a different time");
  assert.equal(await db.collection("schedules").countDocuments({ eventType: "Client meeting" }), 2);
});

test("declining needs a reason the customer can read", async () => {
  const sent = await requestMeeting(db, customer, request(), now);
  await assert.rejects(reviewMeetingRequest(db, admin, sent.id, { action: "decline", reason: "" }, now));
  const { request: declined } = await reviewMeetingRequest(db, admin, sent.id, { action: "decline", reason: "Our office is closed that week." }, now);
  assert.equal(declined.status, "Declined");
  const { meetingRequests } = await getCustomerSchedule(db, customer);
  assert.equal(meetingRequests[0].declineReason, "Our office is closed that week.");
});

test("the Billing Clerk manages payment follow-ups, the admin manages meetings, and customers see only their own meetings and dues", async () => {
  const followUp = await createSchedule(db, clerk, {
    title: "Call about the downpayment", clientId: customer.id, scheduledFor: mondayTen, durationMinutes: 15, notes: "Ask for the bank slip", status: "Scheduled",
  });
  assert.equal(followUp.eventType, "Payment follow-up");
  assert.equal((await notificationsFor(customer)).length, 0, "follow-ups are internal");

  const meeting = await createSchedule(db, admin, {
    title: "Contract review", clientId: customer.id, projectId: projectId.toHexString(), scheduledFor: mondayTwo, durationMinutes: 60, notes: "Staff-only agenda", status: "Scheduled",
  });
  assert.equal(meeting.eventType, "Client meeting");
  await assert.rejects(createSchedule(db, customer, { title: "Mine", clientId: customer.id, scheduledFor: mondayTwo, durationMinutes: 60, status: "Scheduled" }), isError(403));

  // Each role can only update its own kind of event.
  await assert.rejects(updateScheduleStatus(db, clerk, meeting.id, { status: "Cancelled" }), isError(404));
  await assert.rejects(updateScheduleStatus(db, admin, followUp.id, { status: "Completed" }), isError(404));
  assert.equal((await updateScheduleStatus(db, clerk, followUp.id, { status: "Completed" })).status, "Completed");

  const adminView = await getStaffSchedule(db, admin);
  assert.deepEqual(adminView.schedules.map((item) => item.eventType), ["Client meeting"]);
  const clerkView = await getStaffSchedule(db, clerk);
  assert.deepEqual(clerkView.schedules.map((item) => item.eventType).sort(), ["Client meeting", "Payment follow-up"]);
  assert.deepEqual(clerkView.meetingRequests, []);

  const created = new Date();
  await db.collection<InvoiceDocument>("invoices").insertMany([customer, other].map((owner, index) => ({
    _id: new ObjectId(), invoiceNumber: `INV-2026-00000${index + 1}`, customerId: new ObjectId(owner.id), label: "Downpayment",
    basis: "Signed contract", amount: 50000, dueDate: new Date("2026-10-30T00:00:00.000Z"), status: "Sent",
    createdAt: created, updatedAt: created, createdBy: new ObjectId(clerk.id), createdByName: clerk.name,
  }) as unknown as InvoiceDocument));
  assert.equal(clerkView.paymentDues.length, 0);
  assert.equal((await getStaffSchedule(db, clerk)).paymentDues.length, 2);

  const mine = await getCustomerSchedule(db, customer);
  assert.equal(mine.meetings.length, 1);
  assert.equal(mine.meetings[0].title, "Contract review");
  assert.equal("notes" in mine.meetings[0], false, "staff notes stay internal");
  assert.equal(mine.paymentDues.length, 1);
  assert.equal(mine.paymentDues[0].clientId, customer.id);
  assert.equal((await getCustomerSchedule(db, other)).meetings.length, 0);
  await assert.rejects(getCustomerSchedule(db, admin), isError(403));
  await assert.rejects(getStaffSchedule(db, customer), isError(403));
});
