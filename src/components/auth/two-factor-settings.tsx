"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowRight, Copy, Download, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

const codeInputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-center text-base font-semibold tracking-[0.25em] text-stone-950 outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15 sm:max-w-56";

async function postJson<T>(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Something went wrong. Try again.");
  return payload;
}

async function fetchStatus() {
  const response = await fetch("/api/auth/two-factor", { cache: "no-store" });
  const payload = (await response.json()) as TwoFactorStatus & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Unable to load security settings.");
  return payload;
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob(
      [`G4 Builders Inc recovery codes\nEach code works once.\n\n${text}\n`],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "g4-builders-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div>
        <p className="font-semibold text-stone-950">Save your recovery codes</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          If you lose your phone, each code lets you sign in once. They are
          shown only now, so keep them somewhere safe.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-stone-950">
        {codes.map((code) => (
          <li key={code} className="rounded-lg bg-white px-3 py-2 text-center ring-1 ring-stone-200">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={copy}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download
        </Button>
        <Button type="button" onClick={onDone}>
          I saved these codes
        </Button>
      </div>
    </div>
  );
}

type TwoFactorSettingsProps = {
  /** Where to go once 2FA is on, when the user was sent here to set it up. */
  continueTo?: string;
};

export function TwoFactorSettings({ continueTo }: TwoFactorSettingsProps) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<{ qrCode: string; secret: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let active = true;
    fetchStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load security settings.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setCode("");
    setErrorMessage("");
  };

  const run = async (task: () => Promise<void>) => {
    setIsWorking(true);
    setErrorMessage("");
    try {
      await task();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong. Try again.");
      setCode("");
    } finally {
      setIsWorking(false);
    }
  };

  const startSetup = () =>
    run(async () => {
      resetForm();
      setSetup(await postJson<{ qrCode: string; secret: string }>("/api/auth/two-factor/setup"));
    });

  const confirmSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const result = await postJson<{ recoveryCodes: string[] }>(
        "/api/auth/two-factor/enable",
        { code },
      );
      setSetup(null);
      setCode("");
      setRecoveryCodes(result.recoveryCodes);
      setStatus(await fetchStatus());
    });
  };

  const confirmRegenerate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const result = await postJson<{ recoveryCodes: string[] }>(
        "/api/auth/two-factor/recovery-codes",
        { code },
      );
      setRecoveryCodes(result.recoveryCodes);
      setIsRegenerating(false);
      setCode("");
      setStatus(await fetchStatus());
    });
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-stone-950">
              Two-factor authentication
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Require a code from an authenticator app, such as Google
              Authenticator or Microsoft Authenticator, each time you sign in.
              Every G4 Builders Inc account needs it.
            </p>
          </div>
        </div>
        {status ? (
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              status.enabled ? "bg-red-700 text-white" : "bg-stone-100 text-stone-600"
            }`}
          >
            {status.enabled ? "On" : "Off"}
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        {!status && !errorMessage ? (
          <p className="text-sm text-stone-500">Loading security settings…</p>
        ) : null}

        {status && !status.enabled ? (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <p className="font-semibold text-stone-950">Required before you continue</p>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                Turn on two-factor authentication to open the rest of the
                system. It takes about a minute with your phone.
              </p>
            </div>
          </div>
        ) : null}

        {recoveryCodes ? (
          <RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
        ) : null}

        {status && !status.enabled && !setup ? (
          <Button type="button" onClick={startSetup} disabled={isWorking}>
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            {isWorking ? "Preparing…" : "Turn on two-factor authentication"}
          </Button>
        ) : null}

        {setup ? (
          <form onSubmit={confirmSetup} className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-stone-600">
              <li>Install an authenticator app on your phone.</li>
              <li>Scan this QR code with the app, or type the setup key.</li>
              <li>Enter the 6-digit code the app shows to finish.</li>
            </ol>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
              <img
                src={setup.qrCode}
                alt="QR code for adding G4 Builders Inc to an authenticator app"
                width={180}
                height={180}
                className="h-44 w-44 rounded-lg ring-1 ring-stone-200"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Setup key
                </p>
                <p className="mt-1 font-mono text-sm break-all text-stone-950">{setup.secret}</p>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="two-factor-setup-code" className="text-sm font-medium text-stone-600">
                6-digit code
              </label>
              <input
                id="two-factor-setup-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                placeholder="123456"
                required
                className={codeInputClass}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isWorking}>
                {isWorking ? "Checking…" : "Confirm and turn on"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSetup(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {status?.enabled && !recoveryCodes ? (
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-stone-50 p-3">
                <dt className="text-stone-500">Turned on</dt>
                <dd className="mt-1 font-semibold text-stone-950">
                  {status.enabledAt
                    ? new Date(status.enabledAt).toLocaleDateString("en-PH", { dateStyle: "medium" })
                    : "—"}
                </dd>
              </div>
              <div className="rounded-lg bg-stone-50 p-3">
                <dt className="text-stone-500">Recovery codes left</dt>
                <dd
                  className={`mt-1 font-semibold ${
                    status.recoveryCodesRemaining <= 2 ? "text-red-700" : "text-stone-950"
                  }`}
                >
                  {status.recoveryCodesRemaining} of 8
                </dd>
              </div>
            </dl>

            {isRegenerating ? (
              <form onSubmit={confirmRegenerate} className="space-y-3 rounded-xl border border-stone-200 p-4">
                <label htmlFor="two-factor-confirm-code" className="block text-sm font-medium text-stone-700">
                  Enter a code from your authenticator app to create new
                  recovery codes. Your old codes will stop working.
                </label>
                <input
                  id="two-factor-confirm-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="one-time-code"
                  maxLength={20}
                  placeholder="123456"
                  required
                  autoFocus
                  className={codeInputClass}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={isWorking}>
                    {isWorking ? "Checking…" : "Create new codes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsRegenerating(false);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                {continueTo ? (
                  // A full page load makes the proxy read the refreshed session.
                  <a href={continueTo} className={buttonVariants()}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </a>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setIsRegenerating(true);
                  }}
                >
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                  New recovery codes
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
