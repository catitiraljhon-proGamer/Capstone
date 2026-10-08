import { NextResponse } from "next/server";
import { MongoServerError } from "mongodb";
import { ZodError } from "zod";

/** zod's built-in messages ("Too small: expected number to be >=20") need the field name to make sense. */
const builtInZodMessage = /^(Invalid|Too (small|big)|Expected|Unrecognized|Required)/;

/** The first validation problem, phrased for the person who submitted the form. */
export function validationMessage(error: ZodError) {
  const issue = error.issues[0];
  if (!issue) return "The submitted data is invalid.";
  if (!builtInZodMessage.test(issue.message)) return issue.message;
  const field = issue.path.filter((part) => typeof part === "string").at(-1);
  return field ? `Check the ${String(field).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} field: ${issue.message}` : issue.message;
}

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: validationMessage(error), issues: error.issues },
      { status: 400 },
    );
  }

  if (error instanceof MongoServerError && error.code === 11000) {
    return NextResponse.json(
      { error: "A record with the same unique value already exists." },
      { status: 409 },
    );
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";

  if (message.includes("MONGODB_") || message.includes("AUTH_SECRET")) {
    return NextResponse.json({ error: message }, { status: 503 });
  }

  console.error(error);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}

export function unauthorized() {
  return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "You do not have access to this action." }, { status: 403 });
}
