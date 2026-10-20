"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Sparkles } from "lucide-react";
import type { NextStep } from "@/components/customer/dream-house-journey";
import { Button } from "@/components/ui/button";

const toneStyle: Record<NextStep["tone"], { box: string; eyebrow: string; label: string; Icon: typeof Clock3 }> = {
  action: { box: "border-red-200 bg-rose-50", eyebrow: "text-red-700", label: "Your next step", Icon: Sparkles },
  waiting: { box: "border-stone-200 bg-white", eyebrow: "text-stone-500", label: "In progress", Icon: Clock3 },
  done: { box: "border-stone-200 bg-white", eyebrow: "text-red-700", label: "Ready", Icon: CheckCircle2 },
};

/** Scrolls to a section on the card, opening it first if it is collapsed. */
function reveal(target: string) {
  const element = document.getElementById(target);
  if (!element) return;
  const collapsed = element instanceof HTMLDetailsElement ? element : element.closest("details");
  if (collapsed) collapsed.open = true;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** The one thing to do (or wait for) on a Dream House card. */
export function DreamHouseNextStep({ step }: { step: NextStep }) {
  const style = toneStyle[step.tone];
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 ${style.box}`}>
      <div className="min-w-0 flex-1 basis-64">
        <p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${style.eyebrow}`}>
          <style.Icon className="h-4 w-4" aria-hidden="true" />{style.label}
        </p>
        <p className="mt-1 text-base font-semibold tracking-tight text-stone-950">{step.title}</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">{step.detail}</p>
      </div>
      {step.action?.href ? (
        <Button asChild className="min-h-11"><Link href={step.action.href}>{step.action.label}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      ) : step.action?.target ? (
        <Button className="min-h-11" variant={step.tone === "action" ? "default" : "outline"} onClick={() => reveal(step.action!.target!)}>
          {step.action.label}<ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
