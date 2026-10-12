import { readSession } from "@/lib/server/session";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await readSession();

  if (!user) {
    return NextResponse.json({ error: "No active session." }, { status: 401 });
  }

  return NextResponse.json({ user });
}
