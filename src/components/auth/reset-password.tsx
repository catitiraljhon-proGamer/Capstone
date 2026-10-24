"use client";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { passwordPolicyError, passwordPolicyHint } from "@/lib/system-settings";
import { usePublicSettings } from "@/lib/use-public-settings";
import { CircleCheck, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

const inputClassName =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15";

const primaryClassName =
  "block w-full rounded-xl bg-red-700 py-4 text-center text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:opacity-70";

const expiredMessage = "This reset link has expired or was already used. Request a new one.";

export function ResetPasswordPage({ token }: { token: string }) {
  const passwordPolicy = usePublicSettings();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [linkExpired, setLinkExpired] = useState(!token);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const policyProblem = passwordPolicyError(password, passwordPolicy);
    if (policyProblem) {
      setErrorMessage(policyProblem);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json()) as { error?: string; expired?: boolean };
      if (payload.expired) {
        setLinkExpired(true);
        return;
      }
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Unable to reset your password. Try again.");
        return;
      }
      setIsDone(true);
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <AuthCardShell
        title="Password updated"
        description="Your password has been changed and every device signed in to your account was signed out."
      >
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm leading-6 text-stone-700">
          <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          <p>Sign in with your new password to continue.</p>
        </div>
        <Link href="/login" className={`mt-6 ${primaryClassName}`}>
          Go to Sign In
        </Link>
      </AuthCardShell>
    );
  }

  if (linkExpired) {
    return (
      <AuthCardShell title="Link no longer works" description={expiredMessage}>
        <Link href="/forgot-password" className={primaryClassName}>
          Request a New Link
        </Link>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell title="Set a new password" description="Choose a new password for your G4 Builders account.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-stone-600">
            New Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPasswords ? "text" : "password"}
              autoComplete="new-password"
              minLength={passwordPolicy.passwordMinLength}
              maxLength={72}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              aria-describedby="password-hint"
              className={`${inputClassName} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((value) => !value)}
              className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-stone-500 transition hover:text-stone-950"
              aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
            >
              {showPasswords ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
          </div>
          <p id="password-hint" className="text-xs text-stone-500">
            {passwordPolicyHint(passwordPolicy)}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-stone-600">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            maxLength={72}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            className={inputClassName}
          />
        </div>

        <button type="submit" disabled={isSubmitting} className={primaryClassName}>
          {isSubmitting ? "Saving…" : "Reset Password"}
        </button>

        {errorMessage ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </AuthCardShell>
  );
}
