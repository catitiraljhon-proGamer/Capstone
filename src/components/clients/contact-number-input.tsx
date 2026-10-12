"use client";

import {
  phContactNumberMaxLength,
  sanitizePhContactNumberInput,
} from "@/lib/ph-contact-number";
import type { ChangeEvent, InputHTMLAttributes } from "react";

type ContactNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "maxLength" | "name"
>;

/** Philippine mobile number field that ignores letters and symbols as they are typed or pasted. */
export function ContactNumberInput({ onChange, ...props }: ContactNumberInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const cleaned = sanitizePhContactNumberInput(input.value);
    if (cleaned !== input.value) input.value = cleaned;
    onChange?.(event);
  };

  return (
    <input
      {...props}
      name="contactNumber"
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      maxLength={phContactNumberMaxLength}
      onChange={handleChange}
    />
  );
}
