"use client";

import { AccountTermsConsent } from "@/components/auth/account-terms";
import { BackButton } from "@/components/ui/back-button";
import { refreshAccountTerms } from "@/lib/use-account-terms";
import { BrandLogo } from "@/components/ui/brand-logo";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { useClientFormValidation } from "@/components/clients/client-information-form";
import { ContactNumberInput } from "@/components/clients/contact-number-input";
import { PhAddressFields, readAddressDetails } from "@/components/clients/ph-address-fields";
import { FieldError } from "@/components/ui/field-error";
import { RequiredIndicator } from "@/components/ui/required-indicator";
import { phContactNumberExample } from "@/lib/ph-contact-number";
import { passwordPolicyHint } from "@/lib/system-settings";
import { usePublicSettings } from "@/lib/use-public-settings";
import { ArrowLeft, Check, CheckCircle2, Eye, EyeOff, HardHat, MailCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

const benefits = [
  "Browse available house designs",
  "Request and track cost estimates",
  "Review project billing and payments",
  "Download your blueprint, invoices, and receipts",
];

const registrationSteps = [
  { id: "details", label: "Your details" },
  { id: "verify", label: "Verify email" },
] as const;

type RegistrationStep = (typeof registrationSteps)[number]["id"];

/** What the sign-up form sends: first to get a code, then again with the code to create the account. */
type RegistrationDetails = {
  name: string;
  email: string;
  password: string;
  contactNumber: string;
  addressDetails: ReturnType<typeof readAddressDetails>;
  occupation: string;
  termsVersion: string;
};

type ApiPayload = {
  error?: string;
  issues?: { message?: string; path?: (string | number)[] }[];
  expiresInMinutes?: number;
  resendAfterSeconds?: number;
  retryAfterSeconds?: number;
  redirectTo?: string;
};

function readRegistrationDetails(form: HTMLFormElement, termsVersion: string): RegistrationDetails {
  const formData = new FormData(form);
  const value = (key: string) => String(formData.get(key) ?? "").trim();
  return {
    name: value("name"),
    email: value("email").toLowerCase(),
    password: String(formData.get("password") ?? ""),
    contactNumber: value("contactNumber"),
    addressDetails: readAddressDetails(formData),
    occupation: value("occupation"),
    termsVersion,
  };
}

/** The server only accepts the current terms; the Admin published newer ones while this form was open. */
const isOutdatedTerms = (payload: ApiPayload) => Boolean(payload.issues?.some((issue) => issue.path?.[0] === "termsVersion"));

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, payload: (await response.json()) as ApiPayload };
}

function payloadMessage(payload: ApiPayload, fallback: string) {
  return payload.issues?.[0]?.message ?? payload.error ?? fallback;
}

function RegistrationStepIndicator({ step }: { step: RegistrationStep }) {
  return (
    <ol aria-label="Registration steps" className="flex items-center gap-3">
      {registrationSteps.map((item, index) => {
        const current = item.id === step;
        const done = step === "verify" && item.id === "details";
        return (
          <li key={item.id} aria-current={current ? "step" : undefined} className="flex items-center gap-3">
            {index > 0 ? <span aria-hidden="true" className="h-px w-8 bg-stone-300 sm:w-12" /> : null}
            <span className={`flex items-center gap-2 text-sm font-medium ${current ? "text-stone-950" : "text-stone-500"}`}>
              <span
                aria-hidden="true"
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                  current ? "bg-red-700 text-white" : done ? "bg-rose-100 text-red-800" : "bg-stone-100 text-stone-500"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
  const passwordPolicy = usePublicSettings();
  const validation = useClientFormValidation("register", passwordPolicy);
  const { describe, error: fieldError, errorId } = validation;
  /** Step 1 fills in the form; step 2 confirms the emailed code. The account is created only in step 2. */
  const [step, setStep] = useState<RegistrationStep>("details");
  const [details, setDetails] = useState<RegistrationDetails | null>(null);
  const [codeSentTo, setCodeSentTo] = useState("");
  const [codeMinutes, setCodeMinutes] = useState(10);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [sendCodeError, setSendCodeError] = useState("");
  const [codeNotice, setCodeNotice] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState("");
  /** The Terms and Conditions open first; the form can be filled in only after the customer agrees to a version. */
  const [agreedVersion, setAgreedVersion] = useState<string | null>(null);
  /** Newer terms were published while the form was open: they open again on top of it, keeping what was typed. */
  const [termsUpdated, setTermsUpdated] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailField = describe("email");
  // The field's own validation may already show the same message.
  const sendCodeMessage = sendCodeError !== fieldError("email") ? sendCodeError : "";

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const codeSent = (email: string, payload: ApiPayload) => {
    setCodeSentTo(email);
    setCodeMinutes(payload.expiresInMinutes ?? 10);
    setResendIn(payload.resendAfterSeconds ?? 60);
    setVerificationCode("");
    setCodeError("");
  };

  const focusCode = () => setTimeout(() => codeRef.current?.focus(), 0);

  const askTermsAgain = () => {
    refreshAccountTerms();
    setTermsUpdated(true);
    setErrorMessage("The Terms and Conditions were just updated. Read and agree to the new version, then try again.");
  };

  const agreeToTerms = (version: string) => {
    setAgreedVersion(version);
    setDetails((current) => (current ? { ...current, termsVersion: version } : current));
    setTermsUpdated(false);
    setErrorMessage("");
  };

  /** Step 1: the server checks every detail, then emails the code. Nothing is saved to an account yet. */
  const handleContinue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSendingCode) return;
    setErrorMessage("");
    setGoogleError("");
    setSendCodeError("");
    setCodeNotice("");

    // Show every message under its field and focus the first invalid one.
    if (!validation.validate(event.currentTarget)) return;

    const next = readRegistrationDetails(event.currentTarget, agreedVersion ?? "");
    setIsSendingCode(true);
    try {
      const { response, payload } = await postJson("/api/auth/register/send-code", next);
      if (response.ok) {
        codeSent(next.email, payload);
      } else if (response.status === 429 && payload.retryAfterSeconds && codeSentTo === next.email) {
        // A code for this email was sent less than a minute ago and still works.
        setResendIn(payload.retryAfterSeconds);
        setVerificationCode("");
        setCodeError("");
      } else {
        const message = payloadMessage(payload, "Unable to send the verification code.");
        if (isOutdatedTerms(payload)) {
          askTermsAgain();
        } else if (response.status === 409 || payload.issues?.[0]?.path?.[0] === "email") {
          setSendCodeError(message);
          emailRef.current?.focus();
        } else {
          setErrorMessage(message);
        }
        return;
      }
      setDetails(next);
      setStep("verify");
      focusCode();
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const resendCode = async () => {
    if (!details || isSendingCode || resendIn > 0) return;
    setErrorMessage("");
    setCodeError("");
    setCodeNotice("");
    setIsSendingCode(true);
    try {
      const { response, payload } = await postJson("/api/auth/register/send-code", details);
      if (!response.ok) {
        if (isOutdatedTerms(payload)) return askTermsAgain();
        setErrorMessage(payloadMessage(payload, "Unable to send the verification code."));
        if (payload.retryAfterSeconds) setResendIn(payload.retryAfterSeconds);
        return;
      }
      codeSent(details.email, payload);
      setCodeNotice("A new code was sent. Use the latest code only.");
      focusCode();
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const editDetails = () => {
    setStep("details");
    setErrorMessage("");
    setCodeError("");
    setCodeNotice("");
  };

  /** Step 2: the account is created only when the code matches. A wrong code saves nothing. */
  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || !details) return;
    setErrorMessage("");
    setCodeError("");
    setCodeNotice("");

    if (!/^\d{6}$/.test(verificationCode)) {
      setCodeError("Enter the 6-digit code sent to your email.");
      codeRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const { response, payload } = await postJson("/api/auth/register", { ...details, verificationCode });
      if (!response.ok || !payload.redirectTo) {
        const message = payloadMessage(payload, "Unable to create your account.");
        if (isOutdatedTerms(payload)) {
          askTermsAgain();
        } else if (/verification code|6-digit code/i.test(message)) {
          setCodeError(message);
          codeRef.current?.focus();
        } else if (response.status === 400 && payload.issues) {
          // A detail no longer passes the server's checks: fix it in step 1.
          setStep("details");
          setErrorMessage(message);
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

  const errorAlert = errorMessage ? (
    <p
      role="alert"
      aria-live="polite"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
    >
      {errorMessage}
    </p>
  ) : null;

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
              Create Your Client Account
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Register to request estimates and follow your construction project
              from design through billing. Your registration details are saved
              to your client profile for the G4 Builders team.
            </p>
          </div>

          {agreedVersion ? (
          <>
          {step === "details" ? (
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
              disabled={isSendingCode}
              onClick={() => {
                const query = new URLSearchParams({ mode: "register", rememberMe: "false", terms: agreedVersion });
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
          ) : null}

          <div className={`max-w-xl ${step === "details" ? "mt-6" : "mt-8"}`}>
            <RegistrationStepIndicator step={step} />
          </div>

          {/* Stays mounted while the code is checked, so Edit details keeps everything typed in. */}
          <form className="mt-6 max-w-xl space-y-5" onSubmit={handleContinue} hidden={step !== "details"} {...validation.formProps}>
            <p className="text-sm leading-6 text-stone-600">
              Fields marked with a red asterisk (<RequiredIndicator />) are required. Occupation is optional.
            </p>
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-sm font-medium text-stone-700"
              >
                Full Name <RequiredIndicator />
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
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
                Email Address <RequiredIndicator />
              </label>
              <input
                ref={emailRef}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                onChange={() => setSendCodeError("")}
                aria-invalid={emailField["aria-invalid"] ?? (sendCodeMessage ? true : undefined)}
                aria-describedby={[emailField["aria-describedby"], sendCodeMessage ? "send-code-error" : undefined, "email-hint"]
                  .filter(Boolean)
                  .join(" ")}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 aria-invalid:border-red-600"
              />
              <p id="email-hint" className="text-xs text-stone-500">
                Use your Gmail address (@gmail.com). After you continue, we will email you a 6-digit code to confirm it belongs to you.
              </p>
              <FieldError id={errorId("email")} message={fieldError("email")} />
              <FieldError id="send-code-error" message={sendCodeMessage} />
            </div>

            <div className="space-y-2">
              <label htmlFor="contactNumber" className="text-sm font-medium text-stone-700">
                Contact Number <RequiredIndicator />
              </label>
              <ContactNumberInput
                id="contactNumber"
                required
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
                    minLength={passwordPolicy.passwordMinLength}
                    maxLength={72}
                    required
                    {...describe("password")}
                    aria-describedby={[describe("password")["aria-describedby"], "password-hint"].filter(Boolean).join(" ")}
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
                <p id="password-hint" className="text-xs text-stone-500">{passwordPolicyHint(passwordPolicy)}</p>
                <FieldError id={errorId("password")} message={fieldError("password")} />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-stone-700"
                >
                  Confirm Password <RequiredIndicator />
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={passwordPolicy.passwordMinLength}
                  maxLength={72}
                  required
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

            {step === "details" ? errorAlert : null}

            <button
              type="submit"
              disabled={isSendingCode}
              className="w-full rounded-xl bg-red-700 px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingCode ? "Sending code…" : "Continue"}
            </button>
            <p className="text-center text-xs leading-5 text-stone-500">
              Next, confirm your email with the code we send. Your account is created only after the code is confirmed.
            </p>

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

          {step === "verify" && details ? (
          <form className="mt-6 max-w-xl space-y-5" onSubmit={handleVerify} noValidate>
            <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
              <div className="min-w-0 text-sm leading-6 text-stone-700">
                <p className="font-semibold text-stone-950">Check your email</p>
                <p>
                  We sent a 6-digit code to <span className="break-all font-semibold text-stone-950">{codeSentTo}</span>.
                  Check your inbox or Spam folder. The code expires in {codeMinutes} minutes.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="verificationCode" className="block text-sm font-medium text-stone-700">
                Verification Code <RequiredIndicator />
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
              {codeNotice ? (
                <p role="status" className="text-sm text-stone-600">
                  {codeNotice}
                </p>
              ) : null}
            </div>

            {errorAlert}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-red-700 px-5 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating account…" : "Verify & Create Account"}
            </button>

            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <button
                type="button"
                onClick={editDetails}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 font-semibold text-stone-700 transition hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Edit details
              </button>
              <p className="text-stone-600">
                Didn&apos;t get the code?{" "}
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={isSendingCode || isSubmitting || resendIn > 0}
                  className="font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-stone-500 disabled:no-underline"
                >
                  {isSendingCode ? "Sending…" : resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </p>
            </div>

            <p className="text-xs leading-5 text-stone-500">
              Your account is not created until the code is confirmed. If the code is wrong or expired, nothing is saved.
            </p>
          </form>
          ) : null}
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
              Your Project Information in One Place
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
      {(!agreedVersion || termsUpdated) && (
        <AccountTermsConsent
          onAgree={agreeToTerms}
          onDecline={() => window.location.assign(backHref)}
        />
      )}
    </div>
  );
}
