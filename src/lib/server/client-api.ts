import { apiError } from "@/lib/server/api";
import { ClientRequestError } from "@/lib/server/clients";
import { MongoServerError } from "mongodb";
import { NextResponse } from "next/server";

export function assertClientMutation(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== new URL(request.url).origin)) {
    throw new ClientRequestError("This request must come from the application.", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ClientRequestError("Submit client information as JSON.", 415);
  }
}

export function clientApiError(error: unknown) {
  if (error instanceof ClientRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "The submitted data is invalid." }, { status: 400 });
  }
  if (error instanceof MongoServerError && error.code === 11000) {
    return NextResponse.json({ error: "An account already uses that email address. Edit the existing client instead." }, { status: 409 });
  }
  return apiError(error);
}
