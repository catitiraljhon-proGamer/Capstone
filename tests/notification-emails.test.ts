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
  await Promise.all(["users", "notifications"].map((name) => db.collection(name).deleteMany({})));
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

test("customer notifications are emailed exactly once; staff, disabled and rolled-back ones are not", async () => {
  const customer = person({});
  const clerk = person({ email: "clerk@example.test", role: "billing-clerk" });
  const disabled = person({ email: "disabled@example.test", status: "disabled" });
  await db.collection<UserDocument>("users").insertMany([customer, clerk, disabled]);
  const notes = [note(customer._id, "New invoice"), note(clerk._id, "Payment needs review"), note(disabled._id, "New invoice")];
  await db.collection<NotificationDocument>("notifications").insertMany(notes);
  // Never saved, as when its transaction was rolled back.
  const rolledBack = note(customer._id, "Rolled back");

  const ids = [...notes.map((item) => item._id), rolledBack._id];
  await Promise.all([deliverNotificationEmails(db, ids), deliverNotificationEmails(db, ids)]);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, customer.email);
  assert.equal(sent[0].subject, "New invoice | G4 Builders Inc");
  assert.match(sent[0].text, /INV-0001 is ready for payment\./);
  assert.match(sent[0].html, /\/customer\/billing/);
  const saved = await db.collection<NotificationDocument>("notifications").findOne({ _id: notes[0]._id });
  assert.ok(saved?.emailedAt);
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
