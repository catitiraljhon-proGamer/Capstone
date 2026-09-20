import { NextResponse } from "next/server";

function messagingRemoved() {
  return NextResponse.json(
    { error: "Messaging is no longer available. Please use Contact Us to reach G4 Builders Incorporated." },
    { status: 410 },
  );
}

export { messagingRemoved as GET, messagingRemoved as POST, messagingRemoved as PATCH };
