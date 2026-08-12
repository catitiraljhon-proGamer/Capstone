"use client";

import { BrandLogo } from "@/components/ui/brand-logo";
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

const demoAccounts: Record<string, string> = {
  "customer@gmail.com": "/customer",
  "clerk@gmail.com": "/billing-clerk",
  "admin@gmail.com": "/admin",
};

const InputShell = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-stone-200 bg-white shadow-sm transition focus-within:border-red-600 focus-within:ring-2 focus-within:ring-red-600/15">
    {children}
  </div>
);

const GoogleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
    viewBox="0 0 48 48"
    aria-hidden="true"
  >
    <path
      fill="#FFC107"
      d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92Z"
    />
    <path
      fill="#FF3D00"
      d="m6.31 14.69 6.57 4.82C14.65 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69Z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.09 26.72 36 24 36c-5.2 0-9.62-3.32-11.28-7.95L6.2 33.08C9.5 39.56 16.23 44 24 44Z"
    />
    <path
      fill="#1976D2"
      d="M43.61 20.08H42V20H24v8h11.3a12.02 12.02 0 0 1-4.09 5.57l6.19 5.24C42.02 35.03 44 30.04 44 24c0-1.34-.14-2.65-.39-3.92Z"
    />
  </svg>
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
}: SignInPageProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSignIn = (event: FormEvent<HTMLFormElement>) => {
    if (onSignIn) {
      onSignIn(event);
      return;
    }

    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const route = demoAccounts[email];

    if (!route || password !== "123456") {
      setErrorMessage("Use a valid demo email and password.");
      return;
    }

    setErrorMessage("");
    router.push(route);
  };

  return (
    <div className="min-h-screen bg-white text-stone-950">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex min-h-24 w-full max-w-[1180px] items-center justify-between gap-6 px-4 py-4 md:px-6 lg:px-0">
          <Link href="/">
            <BrandLogo />
          </Link>
          <Link
            href="/"
            className="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition hover:bg-red-50 hover:text-red-700"
          >
            Back to Home
          </Link>
        </nav>
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[1180px] grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[0.9fr_1.1fr] md:px-6 lg:px-0">
        <section className="flex items-center justify-center">
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
                      placeholder="customer@gmail.com"
                      autoComplete="email"
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
                        className="absolute inset-y-0 right-3 flex items-center text-stone-500 transition hover:text-stone-950"
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

                <div className="animate-element animate-delay-500 flex items-center justify-between gap-4 text-sm">
                  <label className="flex cursor-pointer items-center gap-3 text-stone-700">
                    <input
                      type="checkbox"
                      name="rememberMe"
                      className="h-4 w-4 rounded border-stone-300 accent-red-700"
                    />
                    Keep me signed in
                  </label>
                  <button
                    type="button"
                    onClick={onResetPassword}
                    className="font-medium text-red-800 transition hover:text-red-950 hover:underline"
                  >
                    Reset password
                  </button>
                </div>

                <button
                  type="submit"
                  className="animate-element animate-delay-600 w-full rounded-xl bg-red-700 py-4 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                >
                  Sign In
                </button>

                {errorMessage ? (
                  <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {errorMessage}
                  </p>
                ) : null}
              </form>

              <div className="animate-element animate-delay-700 relative flex items-center justify-center">
                <span className="w-full border-t border-stone-200" />
                <span className="absolute bg-white px-4 text-sm text-stone-500">
                  Or continue with
                </span>
              </div>

              <button
                type="button"
                onClick={onGoogleSignIn}
                className="animate-element animate-delay-800 flex w-full items-center justify-center gap-3 rounded-xl border border-stone-200 bg-white py-4 text-sm font-medium text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <p className="animate-element animate-delay-1000 text-center text-sm text-stone-500">
                Need access? Contact your project administrator.
              </p>
            </div>
          </div>
        </section>

        <section className="relative hidden overflow-hidden rounded-xl shadow-lg ring-1 ring-stone-200 md:block">
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

