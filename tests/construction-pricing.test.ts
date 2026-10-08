import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPaymentSchedule, defaultScheduleTemplate, estimateTotals, scheduleTemplateError } from "@/lib/construction";

const template = defaultScheduleTemplate("2027-01-04", "2027-12-20");
const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value * 100, 0)) / 100;

test("adds 12% VAT on top of the BOQ subtotal", () => {
  assert.deepEqual(estimateTotals([{ quantity: 1, unitPrice: 6_000_000 }]), { subtotal: 6_000_000, vat: 720_000, total: 6_720_000 });
  assert.deepEqual(estimateTotals([{ quantity: 3, unitPrice: 0.1 }]), { subtotal: 0.3, vat: 0.04, total: 0.34 });
});

test("default template is 30/30/30/10 with dates from start to needed-by", () => {
  assert.deepEqual(template.map((row) => row.percentage), [30, 30, 30, 10]);
  assert.equal(template[0].targetDate, "2027-01-04");
  assert.equal(template.at(-1)!.targetDate, "2027-12-20");
  assert.equal(scheduleTemplateError(template), null);
});

test("30% downpayment on 6M + VAT", () => {
  const schedule = buildPaymentSchedule(6_720_000, template, 30);
  assert.deepEqual(schedule.map((row) => row.amount), [2_016_000, 2_016_000, 2_016_000, 672_000]);
  assert.equal(schedule[0].isDownpayment, true);
});

test("a larger downpayment scales the remaining milestones proportionally", () => {
  const schedule = buildPaymentSchedule(6_720_000, template, 40);
  assert.deepEqual(schedule.map((row) => row.amount), [2_688_000, 1_728_000, 1_728_000, 576_000]);
  assert.equal(sum(schedule.map((row) => row.amount)), 6_720_000);
});

test("amounts always add up to the total, to the centavo", () => {
  const schedule = buildPaymentSchedule(1_234_567.89, template, 33.33);
  assert.equal(sum(schedule.map((row) => row.amount)), 1_234_567.89);
});

test("rejects downpayments below 30% and invalid templates", () => {
  assert.throws(() => buildPaymentSchedule(1_000_000, template, 29.99));
  assert.match(scheduleTemplateError([{ ...template[0], percentage: 20 }, { ...template[1], percentage: 80 }])!, /at least 30%/);
  assert.match(scheduleTemplateError(template.map((row) => ({ ...row, percentage: 30 })))!, /add up to 100%/);
});

test("a 100% downpayment leaves a single billable row", () => {
  assert.deepEqual(buildPaymentSchedule(500_000, template, 100).map((row) => row.amount), [500_000]);
});
