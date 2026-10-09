import { completeProfilePath, type UserRole } from "@/types/domain";

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
