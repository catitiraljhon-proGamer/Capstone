import { NextResponse, type NextRequest } from "next/server";
import { getDatabase } from "@/lib/database/mongodb";
import {
  AccountClosureError, clearReactivationCookie, findReactivation, reactivateAccount, reactivationCookieName,
} from "@/lib/server/account-closure";
import { assertClientMutation, clientApiError } from "@/lib/server/client-api";
import { signInDestination } from "@/lib/server/clients";
import { startSession } from "@/lib/server/session";

/** A deactivated customer who just signed in turns their account back on and is signed in. */
export async function POST(request: NextRequest) {
  try {
    assertClientMutation(request);
    const db = await getDatabase();
    const waiting = await findReactivation(db, request.cookies.get(reactivationCookieName)?.value);
    if (!waiting) {
      const response = NextResponse.json({ error: "Your sign-in expired. Sign in again to reactivate your account." }, { status: 401 });
      clearReactivationCookie(response);
      return response;
    }
    const user = await reactivateAccount(db, waiting.user);
    const response = NextResponse.json({ redirectTo: signInDestination(user) });
    await startSession(response, user, waiting.rememberMe);
    clearReactivationCookie(response);
    return response;
  } catch (error) {
    if (error instanceof AccountClosureError) return NextResponse.json({ error: error.message }, { status: error.status });
    return clientApiError(error);
  }
}

/** "Not now": forgets the pending reactivation; the account stays deactivated. */
export async function DELETE() {
  const response = NextResponse.json({ cancelled: true });
  clearReactivationCookie(response);
  return response;
}
