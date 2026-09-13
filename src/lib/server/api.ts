import { NextResponse } from "next/server";
import { MongoServerError } from "mongodb";
import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "The submitted data is invalid.", issues: error.issues },
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
