"use client";

import { useEffect, useState } from "react";

export function GoogleAuthButton({
  mode,
  rememberMe = false,
  disabled = false,
  onClick,
}: {
  mode: "login" | "register";
  rememberMe?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const resetAfterBackNavigation = () => setIsRedirecting(false);
    window.addEventListener("pageshow", resetAfterBackNavigation);
    return () =>
      window.removeEventListener("pageshow", resetAfterBackNavigation);
  }, []);

  const continueWithGoogle = () => {
    if (onClick) return onClick();
    setIsRedirecting(true);
    const query = new URLSearchParams({ mode, rememberMe: String(rememberMe) });
    window.location.assign(`/api/auth/google?${query}`);
  };

  return (
    <button
      type="button"
      onClick={continueWithGoogle}
      disabled={disabled || isRedirecting}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-stone-300 bg-white py-4 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
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
      {isRedirecting
        ? "Connecting to Google…"
        : mode === "register"
          ? "Sign up with Google"
          : "Sign in with Google"}
    </button>
  );
}
