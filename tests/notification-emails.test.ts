import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryServer } from "mongodb-memory-server";
import { type Db, type MongoClient, ObjectId } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import { type NotificationDocument, type UserDocument } from "@/lib/database/collections";
import { deliverNotificationEmails } from "@/lib/server/notifications";
import { notificationEmail, verificationCodeEmail } from "@/lib/server/email";

type SentMail = { to: string; subject: string; text: string; html: string };

let mongo: MongoMemoryServer;
let db: Db;
const sent: SentMail[] = [];
const emailGlobals = globalThis as typeof globalThis & {
  gmailTransporter?: { key: string; transporter: { sendMail(message: SentMail): Promise<void> } };
};

before(async () => {
  process.env.AUTH_SECRET = "isolated-notification-email-test-secret-32-chars";
  process.env.GMAIL_USER = "sender@example.test";
  process.env.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop";
  // Stands in for Gmail SMTP; email.ts reuses the transporter cached under this key.
  emailGlobals.gmailTransporter = {
    key: "sender@example.test:abcdefghijklmnop",
    transporter: { sendMail: async (message) => void sent.push(message) },
  };
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_notification_email_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  sent.length = 0;
  await Promise.all(["users", "notifications", "system_settings"].map((name) => db.collection(name).deleteMany({})));
});
after(async () => {
  delete emailGlobals.gmailTransporter;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  const cache = globalThis as typeof globalThis & { mongoClientPromise?: Promise<MongoClient> };
  await (await cache.mongoClientPromise)?.close();
  await mongo?.stop();
});

function person(overrides: Partial<UserDocument>): UserDocument {
  return {
    _id: new ObjectId(), name: "Maria Santos", email: "maria@example.test", role: "customer",
    status: "active", authVersion: 0, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function note(userId: ObjectId, title: string): NotificationDocument {
  return { _id: new ObjectId(), userId, title, body: "INV-0001 is ready for payment.", href: "/customer/billing", createdAt: new Date() };
}

test("every role's notifications are emailed exactly once; disabled and rolled-back ones are not", async () => {
  const customer = person({});
  const clerk = person({ email: "clerk@example.test", role: "billing-clerk" });
  const admin = person({ email: "admin@example.test", role: "admin" });
  const disabled = person({ email: "disabled@example.test", status: "disabled" });
  await db.collection<UserDocument>("users").insertMany([customer, clerk, admin, disabled]);
  const notes = [note(customer._id, "New invoice"), note(clerk._id, "Payment needs review"), note(admin._id, "New design request"), note(disabled._id, "New invoice")];
  await db.collection<NotificationDocument>("notifications").insertMany(notes);
  // Never saved, as when its transaction was rolled back.
  const rolledBack = note(customer._id, "Rolled back");

  const ids = [...notes.map((item) => item._id), rolledBack._id];
  await Promise.all([deliverNotificationEmails(db, ids), deliverNotificationEmails(db, ids)]);

  assert.deepEqual(sent.map((message) => message.to).sort(), [admin.email, clerk.email, customer.email].sort());
  const invoice = sent.find((message) => message.to === customer.email);
  assert.equal(invoice?.subject, "New invoice | G4 Builders Inc");
  assert.match(invoice?.text ?? "", /INV-0001 is ready for payment\./);
  assert.match(invoice?.html ?? "", /\/customer\/billing/);
  assert.equal(sent.find((message) => message.to === clerk.email)?.subject, "Payment needs review | G4 Builders Inc");
  const emailed = await db.collection<NotificationDocument>("notifications")
    .countDocuments({ _id: { $in: notes.slice(0, 3).map((item) => item._id) }, emailedAt: { $exists: true } });
  assert.equal(emailed, 3);
  const skipped = await db.collection<NotificationDocument>("notifications").findOne({ _id: notes[3]._id });
  assert.equal(skipped?.emailedAt, undefined);
});

test("the Admin can turn email copies off for a role", async () => {
  const customer = person({});
  const clerk = person({ email: "clerk@example.test", role: "billing-clerk" });
  await db.collection<UserDocument>("users").insertMany([customer, clerk]);
  await db.collection("system_settings").updateOne({ _id: "system" as never }, { $set: { values: { emailCopiesBillingClerk: false } } }, { upsert: true });
  const notes = [note(customer._id, "New invoice"), note(clerk._id, "Payment needs review")];
  await db.collection<NotificationDocument>("notifications").insertMany(notes);
  await deliverNotificationEmails(db, notes.map((item) => item._id));
  assert.deepEqual(sent.map((message) => message.to), [customer.email]);
  // The in-app notification is still there for the clerk.
  assert.equal(await db.collection("notifications").countDocuments({ userId: clerk._id }), 1);
});

test("email content escapes notification text and shows the verification code", () => {
  const message = notificationEmail("a@example.test", "<Ana>", { title: "Note", body: "<script>alert(1)</script>", href: "/customer" });
  assert.equal(message.html.includes("<script>"), false);
  assert.match(message.html, /&lt;script&gt;/);
  assert.match(message.html, /&lt;Ana&gt;/);
  const code = verificationCodeEmail("a@example.test", "042517", 10);
  assert.match(code.subject, /^042517 /);
  assert.match(code.text, /expires in 10 minutes/);
});
