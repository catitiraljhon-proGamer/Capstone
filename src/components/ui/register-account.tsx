"use client";

import { BackButton } from "@/components/ui/back-button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { GoogleAuthButton } from "@/components/ui/google-auth-button";
import { CheckCircle2, Eye, EyeOff, HardHat } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const benefits = [
  "Browse available house designs",
  "Request and track cost estimates",
  "Review project billing and payments",
  "Message the G4 Builders team",
];

export function RegisterAccountPage({
  initialError = "",
}: {
  initialError?: string;
}) {
  const router = useRouter();
  const [showPasswords, setShowPasswords] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [googleError, setGoogleError] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setGoogleError("");

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const payload = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok || !payload.redirectTo) {
        setErrorMessage(payload.error ?? "Unable to create your account.");
        return;
      }

      router.replace(payload.redirectTo);
      router.refresh();
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
          <BackButton href="/login" />
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
              from design through billing.
            </p>
          </div>

          <div className="mt-8 max-w-xl space-y-6">
            {googleError ? (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              >
                {googleError}
              </p>
            ) : null}
            <GoogleAuthButton mode="register" disabled={isSubmitting} />
            <div className="flex items-center gap-4 text-sm text-stone-500">
              <span className="flex-1 border-t border-stone-200" />
              Or register with email
              <span className="flex-1 border-t border-stone-200" />
            </div>
          </div>

          <form className="mt-6 max-w-xl space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="text-sm font-medium text-stone-700"
              >
                Full name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
                placeholder="Juan Dela Cruz"
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium text-stone-700"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="name@example.com"
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-stone-700"
                >
                  Password
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
                    placeholder="At least 8 characters"
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 pr-11 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
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
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-stone-700"
                >
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPasswords ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                  placeholder="Repeat your password"
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
                />
              </div>
            </div>

            <p className="text-xs leading-5 text-stone-500">
              Client registration cannot create staff or administrator accounts.
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
              progress, documents, invoices, and messages to one secure client
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
    </div>
  );
}
