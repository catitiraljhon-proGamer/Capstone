import type { NotificationDocument } from "@/lib/database/collections";
import type { Filter, ObjectId } from "mongodb";

export function visibleNotificationsFor(userId: ObjectId): Filter<NotificationDocument> {
  return {
    userId,
    kind: { $ne: "message" },
    // Older message notifications may have a link without a kind.
    href: { $not: /^\/(?:customer|admin|billing-clerk)\/messages(?:[/?#]|$)/ },
  };
}
