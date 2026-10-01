import { designRequestApi } from "@/lib/server/design-request-api";
import { getCustomerDesignImage } from "@/lib/server/design-requests";

export async function GET(request: Request, context: { params: Promise<{ id: string; index: string }> }) {
  return designRequestApi(request, "customer", async (db, actor) => {
    const { id, index } = await context.params;
    const image = await getCustomerDesignImage(db, actor, id, /^\d+$/.test(index) ? Number(index) : -1);
    const extension = image.mimeType.split("/")[1];
    return new Response(new Uint8Array(image.bytes), { headers: {
      "Content-Type": image.mimeType,
      "Content-Disposition": (new URL(request.url).searchParams.has("download") ? "attachment" : "inline") + '; filename="house-design-' + id + "-" + index + "." + extension + '"',
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  });
}
