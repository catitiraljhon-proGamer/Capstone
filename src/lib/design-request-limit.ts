import type { DesignRequestDto } from "@/types/design-requests";

/** A customer may have at most this many design requests waiting for the admin's review. */
export const maxOpenDesignRequests = 3;

/** Statuses that still wait for the admin's feasibility decision. */
export const openDesignRequestStatuses = ["Pending", "In review"] as const satisfies readonly DesignRequestDto["status"][];

export const designRequestLimitMessage =
  `You already have ${maxOpenDesignRequests} design requests waiting for review. ` +
  "You can send a new request once the admin approves or declines one of them.";

export function countOpenDesignRequests(requests: Pick<DesignRequestDto, "status">[]) {
  return requests.filter((request) =>
    (openDesignRequestStatuses as readonly string[]).includes(request.status),
  ).length;
}
