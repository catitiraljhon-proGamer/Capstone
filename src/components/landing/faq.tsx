"use client";

import { PublicHeader } from "@/components/landing/public-header";
import { maxOpenDesignRequests } from "@/lib/design-request-limit";
import { officeHoursText } from "@/lib/office-hours";
import { MIN_DOWNPAYMENT_PERCENT } from "@/lib/construction";
import { PAYMONGO_MIN_AMOUNT } from "@/types/paymongo";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

type Faq = { question: string; answer: string };
type FaqCategory = { name: string; items: Faq[] };

const categories: FaqCategory[] = [
  {
    name: "General",
    items: [
      {
        question: "Do I need an account?",
        answer: "Yes, to request a house design, review your estimate, pay invoices, or message our team. You can view the home page and our published designs without one.",
      },
      {
        question: "How do I create an account?",
        answer: "Click Register and enter your email; we send a verification code to confirm it. You can also sign up with Google. After signing in, complete your client profile once (contact number and address) before you continue.",
      },
      {
        question: "How do I get updates about my request or project?",
        answer: "Check the bell icon in your account for notifications. Important updates, such as a ready estimate, a new invoice, or a verified payment, are also sent to your email.",
      },
      {
        question: "How do I contact G4 Builders Inc?",
        answer: "Signed-in customers can use Messages to reach the Admin or the Billing Clerk. Anyone can use the Contact Us button at the bottom-right of the page for our phone number, email, and office address.",
      },
      {
        question: "What are your office hours?",
        answer: `${officeHoursText}. We are closed on Sundays.`,
      },
    ],
  },
  {
    name: "Design & Blueprint",
    items: [
      {
        question: "How do I request a house design?",
        answer: "Choose one of our published designs, or send a custom request with your floor area, number of bedrooms and bathrooms, finish level, inspiration images, and preferred dates. The Admin first checks whether the request is feasible.",
      },
      {
        question: "How many design requests can I send?",
        answer: `You can have up to ${maxOpenDesignRequests} requests waiting for review at a time. Once the Admin approves or declines one, you can send another.`,
      },
      {
        question: "Do I pay for the design review?",
        answer: "No. The design and floor plan previews are free, and so are review rounds. You only pay the blueprint fee after you approve the design.",
      },
      {
        question: "Can I ask for changes to my design?",
        answer: "Yes. When you review a design in Dream House, choose Request changes and describe what you want. The Admin sends a revised version for your review.",
      },
      {
        question: "How do I get my blueprint?",
        answer: "Once the full blueprint fee is paid and verified, you can download the blueprint in Dream House. You can also request to pick up a printed copy at our office during office hours; the Admin confirms the time.",
      },
    ],
  },
  {
    name: "Pricing & Payment",
    items: [
      {
        question: "How is my construction cost estimated?",
        answer: "The Admin prepares an itemized estimate (bill of quantities) with quantities, unit prices, and a payment schedule. Requesting and reviewing it is free. You can accept it or ask for a revision.",
      },
      {
        question: "What payment methods do you accept?",
        answer: "You can pay online through PayMongo (GCash, Maya, GrabPay, card, online banking, or QR Ph). You can also pay by bank transfer or cheque and submit the reference or cheque number in Billing Status, or pay in cash at our office.",
      },
      {
        question: "Can I pay an invoice in parts?",
        answer: `Yes. You can pay any amount up to the remaining balance, and the invoice shows as Partially Paid until it is settled. Online payments start at PHP ${PAYMONGO_MIN_AMOUNT.toFixed(2)}. The blueprint unlocks only after its fee is paid in full.`,
      },
      {
        question: "When is my payment confirmed?",
        answer: "Online payments and cash paid at our office are confirmed right away. Bank transfers and cheques you submit stay Pending until the Billing Clerk verifies them. Your official receipt appears in Billing Status once the payment is verified.",
      },
      {
        question: "Will I be reminded before a payment is due?",
        answer: "Yes. We send a notification and an email a few days before an unpaid invoice is due.",
      },
    ],
  },
  {
    name: "Construction & Billing",
    items: [
      {
        question: "Do I have to build with G4 Builders Inc?",
        answer: "No, construction is optional. After your blueprint is paid, you may request a construction cost estimate if you want us to build your house.",
      },
      {
        question: "How much is the downpayment?",
        answer: `At least ${MIN_DOWNPAYMENT_PERCENT}% of the contract total. You choose the amount when you accept the estimate; a bigger downpayment lowers the later billings.`,
      },
      {
        question: "How does progress billing work?",
        answer: "You are billed by stage, following the payment schedule in your accepted estimate, for example: Downpayment / Mobilization, Structural Works, Roofing, Masonry & Rough-Ins, and Completion & Turnover. Each stage gets its own invoice.",
      },
      {
        question: "When does construction start?",
        answer: "After your downpayment is verified. Your project then shows as Scheduled until the start date, and Active once work begins.",
      },
      {
        question: "Where can I see what I have paid?",
        answer: "Your account shows each stage of the payment schedule with its invoice, the amount paid, and the remaining balance. All receipts are in Billing Status.",
      },
    ],
  },
];

function FaqItem({ faq, open, onToggle }: { faq: Faq; open: boolean; onToggle: () => void }) {
  const answerId = useId();
  return (
    <li className="border-b border-stone-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={answerId}
        className="flex w-full items-center justify-between gap-4 py-5 text-left font-semibold text-stone-950 transition hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        {faq.question}
        <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <p id={answerId} hidden={!open} className="pb-5 pr-9 text-sm leading-6 text-stone-600">
        {faq.answer}
      </p>
    </li>
  );
}

export function FaqPage() {
  const [activeCategory, setActiveCategory] = useState(0);
  const [openQuestion, setOpenQuestion] = useState<number | null>(0);
  const tabsId = useId();
  const category = categories[activeCategory];

  function selectCategory(index: number) {
    setActiveCategory(index);
    setOpenQuestion(0);
  }

  return (
    <div className="min-h-screen bg-white text-stone-950">
      <PublicHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Frequently Asked Questions</h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-600">
            Answers to common questions about house designs, blueprints, cost estimates, and payments. Can&apos;t find
            what you&apos;re looking for? Use the Contact Us button at the bottom-right of the page.
          </p>
        </div>

        <div role="tablist" aria-label="FAQ categories" className="mt-8 flex flex-wrap justify-center gap-2">
          {categories.map((item, index) => {
            const selected = index === activeCategory;
            return (
              <button
                key={item.name}
                type="button"
                role="tab"
                id={`${tabsId}-tab-${index}`}
                aria-selected={selected}
                aria-controls={`${tabsId}-panel`}
                onClick={() => selectCategory(index)}
                className={[
                  "min-h-10 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600",
                  selected ? "bg-red-700 text-white hover:bg-red-800" : "border border-stone-200 text-stone-700 hover:bg-red-50 hover:text-red-700",
                ].join(" ")}
              >
                {item.name}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${activeCategory}`} className="mt-6">
          <ul className="border-t border-stone-200">
            {category.items.map((faq, index) => (
              <FaqItem
                key={faq.question}
                faq={faq}
                open={openQuestion === index}
                onToggle={() => setOpenQuestion(openQuestion === index ? null : index)}
              />
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
