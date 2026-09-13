const messages: Record<string, string> = {
  not_configured:
    "Google sign-in is not available yet. Please use email and password for now.",
  cancelled: "Google sign-in was cancelled. You can try again.",
  expired:
    "Your Google sign-in request expired or could not be verified. Please try again.",
  failed: "Unable to sign in with Google. Please try again.",
  database_unavailable:
    "Sign-in is temporarily unavailable because of a database problem. Please try again shortly.",
  unverified_email:
    "Please verify your email address with Google before continuing.",
  account_unavailable:
    "This account cannot use Google sign-in. Please contact G4 Builders for help.",
};

export function googleAuthErrorMessage(code: string | string[] | undefined) {
  return typeof code === "string"
    ? Object.hasOwn(messages, code)
      ? messages[code]
      : messages.failed
    : "";
}
