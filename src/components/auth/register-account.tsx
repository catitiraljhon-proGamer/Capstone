"use client";

import { AccountTermsConsent } from "@/components/auth/account-terms";
import { BackButton } from "@/components/ui/back-button";
import { accountTerms } from "@/lib/account-terms";
import { BrandLogo } from "@/components/ui/brand-logo";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { registrationEmailError, useClientFormValidation } from "@/components/clients/client-information-form";
import { ContactNumberInput } from "@/components/clients/contact-number-input";
import { PhAddressFields, readAddressDetails } from "@/components/clients/ph-address-fields";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { phContactNumberExample } from "@/lib/ph-contact-number";
import { CheckCircle2, Eye, EyeOff, HardHat, MailCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

const benefits = [
  "Browse available house designs",
  "Request and track cost estimates",
  "Review project billing and payments",
  "Download your blueprint, invoices, and receipts",
];

export function RegisterAccountPage({
  initialError = "",
  backHref = "/",
}: {
  initialError?: string;
  backHref?: string;
}) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [googleError, setGoogleError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const validation = useClientFormValidation("register");
  const { describe, error: fieldError, errorId } = validation;
  const [email, setEmail] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [codeMinutes, setCodeMinutes] = useState(10);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [sendCodeError, setSendCodeError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState("");
  /** The Terms and Conditions open first; the form can be filled in only after the customer agrees. */
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const normalizedEmail = email.trim().toLowerCase();
  const codeMatchesEmail = Boolean(codeSentTo) && codeSentTo === normalizedEmail;
  const emailField = describe("email");
  // The field's own validation may already show the same message.
  const sendCodeMessage = sendCodeError !== fieldError("email") ? sendCodeError : "";

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    if (isSendingCode || (codeMatchesEmail && resendIn > 0)) return;
    setSendCodeError("");
    const problem = registrationEmailError(email);
    if (problem) {
      setSendCodeError(problem);
      emailRef.current?.focus();
      return;
    }
    setIsSendingCode(true);
    try {
      const response = await fetch("/api/auth/register/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = (await response.json()) as {
        error?: string;
        issues?: { message?: string }[];
        expiresInMinutes?: number;
        resendAfterSeconds?: number;
        retryAfterSeconds?: number;
      };
      if (!response.ok) {
        setSendCodeError(payload.issues?.[0]?.message ?? payload.error ?? "Unable to send the verification code.");
        if (payload.retryAfterSeconds && codeSentTo === normalizedEmail) setResendIn(payload.retryAfterSeconds);
        return;
      }
      setCodeSentTo(normalizedEmail);
      setCodeMinutes(payload.expiresInMinutes ?? 10);
      setResendIn(payload.resendAfterSeconds ?? 60);
      setVerificationCode("");
      setCodeError("");
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch {
      setSendCodeError("Unable to reach the server. Try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage("");
    setGoogleError("");
    setCodeError("");

    // Show every message under its field and focus the first invalid one.
    if (!validation.validate(event.currentTarget)) return;

    if (!codeMatchesEmail) {
      setSendCodeError("Send a verification code to this email address first.");
      emailRef.current?.focus();
      return;
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      setCodeError("Enter the 6-digit code sent to your email.");
      codeRef.current?.focus();
      return;
    }

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const contactNumber = String(formData.get("contactNumber") ?? "").trim();
    const addressDetails = readAddressDetails(formData);
    const occupation = String(formData.get("occupation") ?? "").trim();

    const details = { name, email, password, contactNumber, addressDetails, occupation, verificationCode };
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...details, termsVersion: accountTerms.version }),
      });
      const payload = (await response.json()) as {
        error?: string;
        issues?: { message?: string }[];
        redirectTo?: string;
      };

      if (!response.ok || !payload.redirectTo) {
        const message = payload.issues?.[0]?.message ?? payload.error ?? "Unable to create your account.";
        if (/verification code|6-digit code/i.test(message)) {
          setCodeError(message);
          codeRef.current?.focus();
        } else {
          setErrorMessage(message);
        }
        return;
      }

      window.location.replace(payload.redirectTo);
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur">
        <nav aria-label="Account navigation" className="mx-auto flex min-h-20 w-full max-w-[1244px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 lg:px-8">
          <Link href="/" aria-label="G4 Builders home" className="min-w-0">
            <BrandLogo />
          </Link>
          <BackButton href={backHref} />
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-[1244px] gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] lg:px-8 lg:py-14">
        <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
              Client registration
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Create your client account
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Register to request estimates and follow your construction project
              from design through billing. Your registration details are saved
              to your client profile for the G4 Builders team.
            </p>
          </div>

          {agreedToTerms ? (
          <>
          <div className="mt-8 max-w-xl space-y-6">
            {googleError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                {googleError}
              </p>
            ) : null}
            <GoogleAuthButton
              mode="register"
              disabled={isSubmitting}
              onClick={() => {
                const query = new URLSearchParams({ mode: "register", rememberMe: "false", terms: accountTerms.version });
                window.location.assign(new URL(`/api/auth/google?${query}`, window.location.origin));
              }}
            />
            <p className="text-xs leading-5 text-stone-500">
              Registering with Google? Add your contact number and address
              in your client profile after signing in.
            </p>
            <div className="flex items-center gap-4 text-sm text-stone-500">
              <span className="flex-1 border-t border-stone-200" />
              Or register with email
              <span className="flex-1 border-t border-stone-200" />
            </div>
          </div>

          <form className="mt-6 max-w-xl space-y-5" onSubmit={handleSubmit} {...validation.formProps}>
            <p className="text-sm leading-6 text-stone-600">
              Fields marked with a red asterisk (<RequiredIndicator />) are required. Occupation is optional.
            </p>
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-sm font-medium text-stone-700"
              >
                Full name <RequiredIndicator />
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
                placeholder="Enter full name"
                {...describe("name")}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
              />
              <FieldError id={errorId("name")} message={fieldError("name")} />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-stone-700"
              >
                Email address <RequiredIndicator />
              </label>
              <div className="flex gap-2">
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  placeholder="Enter Gmail address"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setSendCodeError("");
                  }}
                  aria-invalid={emailField["aria-invalid"] ?? (sendCodeMessage ? true : undefined)}
                  aria-describedby={[emailField["aria-describedby"], sendCodeMessage ? "send-code-error" : undefined, "email-hint"]
                    .filter(Boolean)
                    .join(" ")}
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
                />
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={isSendingCode || (codeMatchesEmail && resendIn > 0)}
                  className="shrink-0 rounded-xl border border-red-700 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-500 disabled:hover:bg-white"
                >
                  {isSendingCode
                    ? "Sending…"
                    : codeMatchesEmail
                      ? resendIn > 0
                        ? `Resend in ${resendIn}s`
                        : "Resend code"
                      : "Send code"}
                </button>
              </div>
              <p id="email-hint" className="text-xs text-stone-500">
                Use your Gmail address (@gmail.com). We will email you a 6-digit code to confirm it belongs to you.
              </p>
              <FieldError id={errorId("email")} message={fieldError("email")} />
              <FieldError id="send-code-error" message={sendCodeMessage} />
            </div>

            {codeMatchesEmail ? (
              <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="flex items-start gap-2 text-sm leading-6 text-stone-700">
                  <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                  <span>
                    We sent a code to <span className="font-semibold text-stone-950">{codeSentTo}</span>.
                    Check your inbox or Spam folder. The code expires in {codeMinutes} minutes.
                  </span>
                </p>
                <label htmlFor="verificationCode" className="block text-sm font-medium text-stone-700">
                  Verification code <RequiredIndicator />
                </label>
                <input
                  ref={codeRef}
                  id="verificationCode"
                  name="verificationCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(event) => {
                    setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    setCodeError("");
                  }}
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? "verification-code-error" : undefined}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-lg font-semibold tracking-[0.5em] outline-none transition placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
                />
                <FieldError id="verification-code-error" message={codeError} />
              </div>
            ) : null}

            <div className="space-y-2">
              <label htmlFor="contactNumber" className="text-sm font-medium text-stone-700">
                Contact number <RequiredIndicator />
              </label>
              <ContactNumberInput
                id="contactNumber"
                required
                placeholder="Enter contact number"
                {...describe("contactNumber")}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
              />
              <p className="text-xs text-stone-500">Philippine mobile number: {phContactNumberExample}.</p>
              <FieldError id={errorId("contactNumber")} message={fieldError("contactNumber")} />
            </div>

            <PhAddressFields
              inputClassName="mt-2 w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
              labelClassName="block text-sm font-medium text-stone-700"
              errors={validation.addressErrors}
            />

            <div className="space-y-2">
              <label htmlFor="occupation" className="text-sm font-medium text-stone-700">
                Occupation (optional)
              </label>
              <input
                id="occupation"
                name="occupation"
                type="text"
                maxLength={100}
                placeholder="Enter your occupation"
                {...describe("occupation")}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
              />
              <FieldError id={errorId("occupation")} message={fieldError("occupation")} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-stone-700"
                >
                  Password <RequiredIndicator />
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPasswords ? "text" : "password"}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    required
                    placeholder="Enter password"
                    {...describe("password")}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 pr-11 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((value) => !value)}
                    className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-stone-500 transition hover:text-stone-950"
                    aria-label={
                      showPasswords ? "Hide passwords" : "Show passwords"
                    }
                  >
                    {showPasswords ? (
                      <Eye className="h-5 w-5" />
                    ) : (
                      <EyeOff className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <FieldError id={errorId("password")} message={fieldError("password")} />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-stone-700"
                >
                  Confirm password <RequiredIndicator />
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                  placeholder="Re-enter password"
                  {...describe("confirmPassword")}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
                />
                <FieldError id={errorId("confirmPassword")} message={fieldError("confirmPassword")} />
              </div>
            </div>

            <p className="text-xs leading-5 text-stone-500">
              Client registration cannot create staff or administrator accounts. Your agreement to the Terms and
              Conditions is saved with your new account.
            </p>

            {errorMessage ? (
              <p
                role="alert"
                aria-live="polite"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-red-700 px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating account…" : "Create Client Account"}
            </button>

            <p className="text-center text-sm text-stone-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-red-700 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </form>
          </>
          ) : (
          <div className="mt-8 max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-5">
            <p className="text-sm font-semibold text-red-900">Read and agree to the Terms and Conditions first</p>
            <p className="mt-1 text-sm leading-6 text-stone-600">The sign-up form opens after you agree. You only agree once.</p>
          </div>
          )}
        </section>

        <aside className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-950 via-red-800 to-rose-700 p-7 text-white shadow-lg lg:p-9">
          <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <HardHat className="h-6 w-6" />
            </span>
            <h2 className="mt-7 text-2xl font-semibold tracking-tight">
              Your project information in one place
            </h2>
            <p className="mt-3 text-sm leading-6 text-red-100">
              Your account connects estimates, design requests, project
              progress, blueprints, and invoices to one secure client
              profile.
            </p>

            <ul className="mt-8 space-y-4">
              {benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex items-start gap-3 text-sm text-white"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-200" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
      {!agreedToTerms && (
        <AccountTermsConsent
          onAgree={() => setAgreedToTerms(true)}
          onDecline={() => window.location.assign(backHref)}
        />
      )}
    </div>
  );
}
