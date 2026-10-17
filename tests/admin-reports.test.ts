import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { ObjectId, type Db } from "mongodb";
import { getDatabase } from "@/lib/database/mongodb";
import type { InvoiceDocument, PaymentDocument, ProjectDocument, UserDocument } from "@/lib/database/collections";
import { getAdminCollectionsReport } from "@/lib/server/admin-reports";

let mongo: MongoMemoryReplSet;
let db: Db;
const customerId = new ObjectId();
const projectId = new ObjectId();
const designRequestId = new ObjectId();
const created = new Date("2026-08-01T00:00:00.000Z");

const invoice = (extra: Partial<InvoiceDocument> & Pick<InvoiceDocument, "invoiceNumber" | "amount" | "status" | "dueDate">): InvoiceDocument => ({
  _id: new ObjectId(), customerId, projectId, label: "Progress billing", progressPercentage: 10,
  createdAt: created, updatedAt: created, ...extra,
});
const payment = (extra: Partial<PaymentDocument> & Pick<PaymentDocument, "reference" | "amount" | "status" | "paidAt">): PaymentDocument => ({
  _id: new ObjectId(), customerId, projectId, method: "Bank transfer", createdAt: created, ...extra,
});

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = mongo.getUri();
  process.env.MONGODB_DB = "isolated_admin_report_tests";
  db = await getDatabase();
});
beforeEach(async () => {
  assert.equal(db.databaseName, "isolated_admin_report_tests");
  await Promise.all(["users", "projects", "invoices", "payments"].map((name) => db.collection(name).deleteMany({})));
  await db.collection<UserDocument>("users").insertOne({
    _id: customerId, name: "Test Customer", email: "customer@example.test", role: "customer", status: "active", createdAt: created, updatedAt: created,
  });
  await db.collection<ProjectDocument>("projects").insertOne({
    _id: projectId, reference: "PRJ-001", name: "Test residence", customerId, status: "Active", contractPrice: 500000, createdAt: created, updatedAt: created,
  });
});
after(async () => { await db?.client.close(); await mongo?.stop(); });

test("project totals count issued invoices and verified payments only", async () => {
  const paidInvoice = invoice({ invoiceNumber: "INV-1", amount: 100000, status: "Paid", dueDate: new Date("2026-08-15"), issuedAt: new Date("2026-08-02T03:00:00Z") });
  const overdueInvoice = invoice({ invoiceNumber: "INV-2", amount: 50000, status: "Sent", dueDate: new Date("2026-09-01"), issuedAt: new Date("2026-08-20T03:00:00Z") });
  const futureInvoice = invoice({ invoiceNumber: "INV-3", amount: 30000, status: "Partially Paid", dueDate: new Date("2099-01-01"), issuedAt: new Date("2026-09-30T20:00:00Z") });
  await db.collection<InvoiceDocument>("invoices").insertMany([
    paidInvoice, overdueInvoice, futureInvoice,
    invoice({ invoiceNumber: "INV-DRAFT", amount: 999, status: "Draft", dueDate: new Date("2026-08-15") }),
    invoice({ invoiceNumber: "INV-VOID", amount: 888, status: "Void", dueDate: new Date("2026-08-15"), issuedAt: new Date("2026-08-02") }),
    invoice({ invoiceNumber: "INV-FEE", amount: 15000, status: "Paid", dueDate: new Date("2026-08-15"), projectId: undefined, designRequestId, issuedAt: new Date("2026-08-05") }),
  ]);
  await db.collection<PaymentDocument>("payments").insertMany([
    payment({ reference: "PAY-1", amount: 100000, status: "Verified", invoiceId: paidInvoice._id, paidAt: new Date("2026-08-10T03:00:00Z") }),
    payment({ reference: "PAY-2", amount: 10000, status: "Verified", invoiceId: futureInvoice._id, paidAt: new Date("2026-10-01T03:00:00Z") }),
    payment({ reference: "PAY-PENDING", amount: 5000, status: "Pending", invoiceId: overdueInvoice._id, paidAt: new Date("2026-09-02") }),
    payment({ reference: "PAY-FEE", amount: 15000, status: "Verified", projectId: undefined, paidAt: new Date("2026-08-06T03:00:00Z") }),
  ]);

  const report = await getAdminCollectionsReport(db);
  assert.deepEqual(report.projects, [{
    id: projectId.toHexString(), reference: "PRJ-001", name: "Test residence", customerName: "Test Customer", status: "Active",
    contractPrice: 500000, billed: 180000, collected: 110000, outstanding: 70000, overdue: 50000,
  }]);
  // Draft and void invoices and unverified payments never reach the monthly entries; design fees have no project.
  assert.equal(report.invoiced.length, 4);
  assert.deepEqual(report.invoiced.find((entry) => entry.projectId === "")?.amount, 15000);
  assert.equal(report.collected.length, 3);
  // Dates use Manila time: 8:00 PM UTC on September 30 is already October 1 in Manila.
  assert.ok(report.invoiced.some((entry) => entry.amount === 30000 && entry.issuedOn === "2026-10-01"));
  assert.ok(report.collected.some((entry) => entry.amount === 10000 && entry.paidOn === "2026-10-01"));

  // Export rows carry the details the workbook lists.
  const overdueEntry = report.invoiced.find((entry) => entry.invoiceNumber === "INV-2");
  assert.deepEqual(
    { customer: overdueEntry?.customerName, project: overdueEntry?.projectName, paid: overdueEntry?.paid, balance: overdueEntry?.balance, status: overdueEntry?.status },
    { customer: "Test Customer", project: "PRJ-001 · Test residence", paid: 0, balance: 50000, status: "Overdue" },
  );
  assert.match(report.invoiced.find((entry) => entry.invoiceNumber === "INV-FEE")?.projectName ?? "", /^Design request /);
  const firstPayment = report.collected.find((entry) => entry.reference === "PAY-1");
  assert.deepEqual(
    { invoice: firstPayment?.invoiceNumber, method: firstPayment?.method, project: firstPayment?.projectName },
    { invoice: "INV-1", method: "Bank transfer", project: "PRJ-001 · Test residence" },
  );
  assert.equal(report.collected.find((entry) => entry.reference === "PAY-FEE")?.invoiceNumber, "Unallocated");
});
