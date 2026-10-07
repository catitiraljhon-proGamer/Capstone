"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type TwoFactorChallengeProps = {
  onRestart: () => void;
};

export function TwoFactorChallenge({ onRestart }: TwoFactorChallengeProps) {
  const router = useRouter();
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/auth/two-factor/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json()) as {
        error?: string;
        redirectTo?: string;
        restart?: boolean;
      };
      if (!response.ok || !payload.redirectTo) {
        if (payload.restart) {
          onRestart();
          return;
        }
        setErrorMessage(payload.error ?? "Unable to verify the code.");
        setCode("");
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
    <form className="space-y-5" onSubmit={submit}>
      <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-700 text-white">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight text-stone-950">
            Two-factor authentication
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            {useRecoveryCode
              ? "Enter one of the recovery codes you saved when you turned on two-factor authentication."
              : "Open your authenticator app and enter the 6-digit code for G4 Builders Inc."}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="two-factor-code" className="text-sm font-medium text-stone-600">
          {useRecoveryCode ? "Recovery code" : "Authentication code"}
        </label>
        <input
          key={useRecoveryCode ? "recovery" : "authenticator"}
          id="two-factor-code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode={useRecoveryCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={useRecoveryCode ? undefined : "[0-9 ]{6,7}"}
          maxLength={useRecoveryCode ? 20 : 7}
          placeholder={useRecoveryCode ? "xxxxx-xxxxx" : "123456"}
          autoFocus
          required
          className="w-full rounded-xl border border-stone-200 bg-white p-4 text-center text-lg font-semibold tracking-[0.3em] text-stone-950 shadow-sm outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-red-700 py-4 text-sm font-medium text-white shadow-sm transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:opacity-60"
      >
        {isSubmitting ? "Verifying…" : "Verify and sign in"}
      </button>

      {errorMessage ? (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setUseRecoveryCode((value) => !value);
            setCode("");
            setErrorMessage("");
          }}
          className="font-medium text-red-700 hover:underline"
        >
          {useRecoveryCode ? "Use authenticator code" : "Use a recovery code"}
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="font-medium text-stone-500 hover:text-stone-950"
        >
          Back to sign in
        </button>
      </div>
    </form>
  );
}
