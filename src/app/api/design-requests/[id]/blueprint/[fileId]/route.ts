import { NextResponse } from "next/server";
import { designRequestApi } from "@/lib/server/design-request-api";
import { deleteBlueprintFile, getBlueprintFile } from "@/lib/server/design-requests";

export async function GET(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) => {
    const { id, fileId } = await context.params;
    const file = await getBlueprintFile(db, actor, id, fileId);
    const disposition = new URL(request.url).searchParams.has("download") ? "attachment" : "inline";
    return new Response(new Uint8Array(file.bytes), { headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  return designRequestApi(request, "admin", async (db, actor) => {
    const { id, fileId } = await context.params;
    await deleteBlueprintFile(db, actor, id, fileId);
    return NextResponse.json({ ok: true });
  });
}
