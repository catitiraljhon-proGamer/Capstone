import { redirect } from "next/navigation";

// Legacy URL: this page now lives in Dream House. Old links and notifications keep working.
export default async function ProjectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const suffix = query.toString();
  redirect(suffix ? `/customer/dream-house?${suffix}` : "/customer/dream-house");
}
