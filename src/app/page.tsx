import LandingPage from "@/components/landing/landing-page";
import { defaultAboutUs, type AboutUsContent } from "@/lib/about-us";
import { getDatabase } from "@/lib/database/mongodb";
import { getAboutUsContent } from "@/lib/server/about-us";
import { connection } from "next/server";

export default async function Home() {
  // Read on every visit, so What We Do changes in Maintenance > About Us show here too.
  await connection();
  let content: AboutUsContent = defaultAboutUs;
  try {
    content = await getAboutUsContent(await getDatabase());
  } catch (error) {
    // Without the database the home page still shows the built-in services.
    console.error("Unable to load the home page services", { errorType: error instanceof Error ? error.name : "UnknownError" });
  }
  return <LandingPage content={content} />;
}
