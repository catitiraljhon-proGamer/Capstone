import { z } from "zod";

/** Limits for each part of the Terms and Conditions; the editor shows the same ones. */
export const termsLimits = {
  title: 120,
  introduction: 600,
  noticeTitle: 100,
  notice: 1000,
  sectionTitle: 120,
  sectionBody: 2000,
  sections: 30,
  casesHeading: 120,
  casesIntroduction: 600,
  caseText: 400,
  cases: 10,
  acknowledgment: 600,
} as const;

const text = (label: string, min: number, max: number) =>
  z.string().trim().min(min, `Enter ${label}.`).max(max, `Keep ${label} within ${max} characters.`);

/** What the Admin publishes; the server adds the version. Shared so the editor checks the same rules before saving. */
export const termsContentSchema = z.object({
  title: text("the title", 5, termsLimits.title),
  introduction: text("the introduction", 10, termsLimits.introduction),
  noticeTitle: text("the notice title", 5, termsLimits.noticeTitle),
  notice: text("the notice text", 10, termsLimits.notice),
  sections: z.array(z.object({
    title: text("the section title", 3, termsLimits.sectionTitle),
    body: text("the section text", 10, termsLimits.sectionBody),
  }).strict())
    .min(1, "Keep at least one section.")
    .max(termsLimits.sections, `Use ${termsLimits.sections} sections or fewer.`),
  cases: z.object({
    heading: text("the heading", 3, termsLimits.casesHeading),
    introduction: text("the introduction", 10, termsLimits.casesIntroduction),
    items: z.array(z.object({
      act: text("the act", 5, termsLimits.caseText),
      law: text("the law that applies", 5, termsLimits.caseText),
      consequence: text("what can happen", 5, termsLimits.caseText),
    }).strict()).max(termsLimits.cases, `Use ${termsLimits.cases} examples or fewer.`),
  }).strict(),
  acknowledgment: text("the agreement sentence", 10, termsLimits.acknowledgment),
}).strict();

export type TermsContentInput = z.infer<typeof termsContentSchema>;
