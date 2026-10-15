import { designRequestApi } from "@/lib/server/design-request-api";
import { getDesignVersionImage } from "@/lib/server/design-requests";

/** Watermarked previews in the UI; served inline only, never as a download. */
export async function GET(request: Request, context: { params: Promise<{ id: string; version: string; index: string }> }) {
  return designRequestApi(request, ["customer", "admin"], async (db, actor) => {
    const { id, version, index } = await context.params;
    const toNumber = (value: string) => (/^\d+$/.test(value) ? Number(value) : -1);
    const image = await getDesignVersionImage(db, actor, id, toNumber(version), toNumber(index));
    return new Response(new Uint8Array(image.bytes), { headers: {
      "Content-Type": image.mimeType,
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  });
}
