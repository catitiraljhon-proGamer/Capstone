import { redirect } from "next/navigation";

/** My Profile is now the first tab of Manage Account. */
export default function ProfilePage() {
  redirect("/customer/account");
}
