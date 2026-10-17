import { ObjectId, type Db } from "mongodb";
import { collections, type InvoiceDocument, type PaymentDocument } from "@/lib/database/collections";
import { invoiceState, manilaDate, sumMoney } from "@/lib/billing";
import { formatPeso } from "@/lib/house-design-data";
import { getSystemSettings } from "@/lib/server/maintenance";
import { insertNotifications } from "@/lib/server/notifications";


const day = 86_400_000;

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * day).toISOString().slice(0, 10);
}

function dueLabel(daysLeft: number) {
  return daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
}

/**
 * Daily job: reminds each customer about issued, unpaid invoices due within the next few days (Manila time).
 * Each invoice is reminded once per due date, so running the job again, or twice in one day, sends nothing new.
 */
export async function sendDuePaymentReminders(db: Db, now = new Date()) {
  const today = manilaDate(now);
  // Customers are reminded once when an unpaid invoice is this many days (or fewer) from its due date.
  const { dueReminderDays } = await getSystemSettings(db);
  const lastDay = addDays(today, dueReminderDays);
  const invoices = db.collection<InvoiceDocument>(collections.invoices);
  const candidates = await invoices.find({
    status: { $in: ["Sent", "Partially Paid"] },
    dueDate: { $gte: new Date(`${today}T00:00:00.000Z`), $lte: new Date(`${lastDay}T00:00:00.000Z`) },
  }).toArray();

  let sent = 0;
  for (const invoice of candidates) {
    const dueDate = invoice.dueDate.toISOString().slice(0, 10);
    if (invoice.dueReminderSentFor === dueDate) continue;
    const payments = await db.collection<PaymentDocument>(collections.payments)
      .find({ invoiceId: invoice._id, status: "Verified" }, { projection: { amount: 1 } }).toArray();
    const { balance } = invoiceState(invoice, sumMoney(payments.map((payment) => payment.amount)), now);
    if (balance <= 0) continue;
    // Claim the reminder first so overlapping runs cannot both send it.
    const claimed = await invoices.updateOne(
      { _id: invoice._id, dueReminderSentFor: { $ne: dueDate } },
      { $set: { dueReminderSentFor: dueDate } },
    );
    if (!claimed.modifiedCount) continue;
    const daysLeft = Math.round((Date.parse(`${dueDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / day);
    const dueOn = invoice.dueDate.toLocaleDateString("en-PH", { timeZone: "UTC", dateStyle: "long" });
    await insertNotifications(db, [{
      _id: new ObjectId(), userId: invoice.customerId,
      title: `Payment due ${dueLabel(daysLeft)}`,
      body: `${invoice.invoiceNumber} · ${invoice.label}: ${formatPeso(balance)} is due on ${dueOn}. Open Billing Status to pay or submit your payment details.`,
      href: `/customer/billing?invoice=${invoice._id.toHexString()}`, kind: "payment-due-reminder", entityId: invoice._id, createdAt: now,
    }]);
    sent += 1;
  }
  return { checked: candidates.length, sent, today };
}
