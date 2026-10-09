import { completeProfilePath, roleHomePaths, type UserRole } from "@/types/domain";

/**
 * Every account must turn on two-factor authentication before it can use the
 * system. Until then, each role can only open its own security page.
 */
export const twoFactorSetupPaths: Record<UserRole, string> = {
  customer: "/customer/security",
  "billing-clerk": "/billing-clerk/security",
  admin: "/admin/security",
};

/** Pages an account may open before 2FA is on: setup itself, and customer details that come first. */
export function isOpenBeforeTwoFactor(role: UserRole, pathname: string) {
  return (
    pathname === twoFactorSetupPaths[role] ||
    (role === "customer" && pathname === completeProfilePath)
  );
}

/**
 * Reads the setup page's `next` search param. Only an in-portal path for the
 * role is kept; anything else falls back to its home. No param means the user
 * opened the page directly, so there is nowhere to continue to.
 */
export function twoFactorContinuePath(
  role: UserRole,
  value: string | string[] | undefined,
) {
  if (typeof value !== "string") return undefined;
  const home = roleHomePaths[role];
  if (
    value.startsWith("//") ||
    (value !== home && !value.startsWith(`${home}/`)) ||
    value.startsWith(twoFactorSetupPaths[role])
  ) {
    return home;
  }
  return value;
}
