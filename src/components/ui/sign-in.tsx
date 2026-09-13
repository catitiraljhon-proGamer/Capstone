"use client";

import { BackButton } from "@/components/ui/back-button";
import { BrandLogo } from "@/components/ui/brand-logo";
import { GoogleAuthButton } from "@/components/ui/google-auth-button";
import { Building2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";

export interface Testimonial {
  name: string;
  role: string;
  text: string;
}

interface SignInPageProps {
  title?: ReactNode;
  description?: ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  onSignIn?: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  initialError?: string;
  googleLinkEmail?: string;
  initialRememberMe?: boolean;
}

const defaultTestimonials: Testimonial[] = [
  {
    name: "Project Controls",
    role: "Billing Review",
    text: "Track approved work, pending variations, and invoice status before releasing progress billing.",
  },
  {
    name: "Site Operations",
    role: "BOQ Updates",
    text: "Keep quantities and cost items organized across active G4 Builders Inc projects.",
  },
];

const InputShell = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-stone-200 bg-white shadow-sm transition focus-within:border-red-600 focus-within:ring-2 focus-within:ring-red-600/15">
    {children}
  </div>
);

const TestimonialCard = ({
  testimonial,
  delayClass,
}: {
  testimonial: Testimonial;
  delayClass: string;
}) => (
  <div
    className={`animate-testimonial ${delayClass} w-72 rounded-xl border border-white/25 bg-white/85 p-5 text-stone-800 shadow-lg backdrop-blur`}
  >
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-red-700 text-white">
        <Building2 className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold">{testimonial.name}</p>
        <p className="text-xs text-stone-500">{testimonial.role}</p>
      </div>
    </div>
    <p className="mt-3 text-sm leading-6 text-stone-600">{testimonial.text}</p>
  </div>
);

export function SignInPage({
  title = "Welcome back",
  description = "Sign in to manage estimates, billing approvals, project costs, and reports for G4 Builders Inc.",
  heroImageSrc = "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=2160&q=80",
  testimonials = defaultTestimonials,
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  initialError = "",
  googleLinkEmail,
  initialRememberMe = false,
}: SignInPageProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(initialRememberMe);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    if (onSignIn) {
      onSignIn(event);
      return;
    }

    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const rememberMe = formData.get("rememberMe") === "on";
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          rememberMe,
          linkGoogle: Boolean(googleLinkEmail),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        redirectTo?: string;
      };

      if (!response.ok || !payload.redirectTo) {
        setErrorMessage(payload.error ?? "Unable to sign in.");
        return;
      }

      router.push(payload.redirectTo);
      router.refresh();
    } catch {
      setErrorMessage("Unable to reach the server. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur">
        <nav aria-label="Account navigation" className="mx-auto flex min-h-20 w-full max-w-[1244px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6 lg:px-8">
          <Link href="/" aria-label="G4 Builders home" className="min-w-0">
            <BrandLogo />
          </Link>
          <BackButton href="/" />
        </nav>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-5rem)] w-full max-w-[1244px] grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8">
        <section className="flex min-w-0 items-center justify-center">
          <div className="w-full max-w-md">
            <div className="flex flex-col gap-6">
              <div>
                <h1 className="animate-element animate-delay-100 text-4xl font-semibold leading-tight tracking-tight text-stone-950 md:text-5xl">
                  {title}
                </h1>
                <p className="animate-element animate-delay-200 mt-3 text-sm leading-6 text-stone-600">
                  {description}
                </p>
              </div>

              {googleLinkEmail ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-6 break-words text-stone-700">
                  An account already exists for{" "}
                  <strong>{googleLinkEmail}</strong>. Enter your G4 Builders
                  password once to connect Google and sign in.
                  <Link
                    href="/login"
                    className="mt-2 block font-semibold text-red-700 hover:underline"
                  >
                    Use another sign-in method
                  </Link>
                </div>
              ) : null}

              <form className="space-y-5" onSubmit={handleSignIn}>
                <div className="animate-element animate-delay-300 space-y-2">
                  <label
                    htmlFor="email"
                    className="text-sm font-medium text-stone-600"
                  >
                    Email Address
                  </label>
                  <InputShell>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      defaultValue={googleLinkEmail ?? ""}
                      readOnly={Boolean(googleLinkEmail)}
                      required
                      className="w-full rounded-xl bg-transparent p-4 text-sm text-stone-950 outline-none placeholder:text-stone-400"
                    />
                  </InputShell>
                </div>

                <div className="animate-element animate-delay-400 space-y-2">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-stone-600"
                  >
                    Password
                  </label>
                  <InputShell>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className="w-full rounded-xl bg-transparent p-4 pr-12 text-sm text-stone-950 outline-none placeholder:text-stone-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-stone-500 transition hover:text-stone-950"
                        aria-label={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </InputShell>
                </div>

                <div className="animate-element animate-delay-500 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-stone-700">
                    <input
                      type="checkbox"
                      name="rememberMe"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="h-4 w-4 rounded border-stone-300 accent-red-700"
                    />
                    Keep me signed in
                  </label>
                  {onResetPassword ? (
                    <button
                      type="button"
                      onClick={onResetPassword}
                      className="font-medium text-red-800 transition hover:text-red-950 hover:underline"
                    >
                      Reset password
                    </button>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="animate-element animate-delay-600 w-full rounded-xl bg-red-700 py-4 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                >
                  {isSubmitting
                    ? "Signing in…"
                    : googleLinkEmail
                      ? "Connect Google and sign in"
                      : "Sign In"}
                </button>

                {errorMessage ? (
                  <p
                    role="alert"
                    className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    {errorMessage}
                  </p>
                ) : null}
              </form>

              {!googleLinkEmail ? (
                <>
                  <div className="animate-element animate-delay-700 relative flex items-center justify-center">
                    <span className="w-full border-t border-stone-200" />
                    <span className="absolute bg-white px-4 text-sm text-stone-500">
                      Or
                    </span>
                  </div>

                  <GoogleAuthButton
                    mode="login"
                    rememberMe={rememberMe}
                    disabled={isSubmitting}
                    onClick={onGoogleSignIn}
                  />
                </>
              ) : null}

              <p className="animate-element animate-delay-1000 text-center text-sm text-stone-500">
                New client?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-red-700 hover:underline"
                >
                  Create an account
                </Link>
              </p>
            </div>
          </div>
        </section>

        <section className="relative hidden min-w-0 overflow-hidden rounded-xl shadow-lg ring-1 ring-stone-200 lg:block">
          <div
            className="animate-slide-right absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageSrc})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-br from-red-950/80 via-red-700/45 to-rose-600/35" />
          <div className="relative flex h-full min-h-[680px] flex-col justify-between p-8">
            <div className="max-w-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-100">
                Project Cost Control
              </p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-white">
                Keep estimates and billing aligned from field to office.
              </h2>
            </div>

            {testimonials.length > 0 && (
              <div className="flex flex-wrap gap-4">
                <TestimonialCard
                  testimonial={testimonials[0]}
                  delayClass="animate-delay-800"
                />
                {testimonials[1] ? (
                  <TestimonialCard
                    testimonial={testimonials[1]}
                    delayClass="animate-delay-1000"
                  />
                ) : null}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
