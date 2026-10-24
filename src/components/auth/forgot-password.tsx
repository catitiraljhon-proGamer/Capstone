"use client";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

const inputClassName =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok || !payload.message) {
        setErrorMessage(payload.error ?? "Unable to send the reset email. Try again.");
        return;
      }
      setSentMessage(payload.message);
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sentMessage) {
    return (
      <AuthCardShell title="Check your email" description={sentMessage}>
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm leading-6 text-stone-700">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          <p>
            We sent it to <strong className="break-all">{email.trim().toLowerCase()}</strong>. Click{" "}
            <strong>Reset Password</strong> in the email to set a new password. The link expires in 30 minutes.
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-3 text-sm">
          <Link
            href="/login"
            className="w-full rounded-xl bg-red-700 py-4 text-center font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
          >
            Back to Sign In
          </Link>
          <button
            type="button"
            onClick={() => setSentMessage("")}
            className="font-medium text-red-800 transition hover:text-red-950 hover:underline"
          >
            Use a different email
          </button>
        </div>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell
      title="Forgot your password?"
      description="Enter the email address on your G4 Builders account. We will send a link to reset your password."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-stone-600">
            Email Address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className={inputClassName}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-red-700 py-4 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:opacity-70"
        >
          {isSubmitting ? "Sending…" : "Send Reset Link"}
        </button>

        {errorMessage ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <p className="text-center text-sm text-stone-500">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-red-700 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCardShell>
  );
}
