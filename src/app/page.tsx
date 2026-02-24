import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Providers } from "@/components/Providers";
import { AppShell } from "@/components/AppShell";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const tabParam = typeof searchParams?.tab === "string" ? searchParams.tab : undefined;
  const reviewOpen = searchParams?.reviewOpen === "1";
  const reviewMonth =
    typeof searchParams?.reviewMonth === "string" && searchParams.reviewMonth.trim()
      ? searchParams.reviewMonth
      : undefined;

  return (
    <Providers>
      <AppShell
        initialTab={tabParam === "automation" ? "automation" : "dashboard"}
        initialReviewOpen={reviewOpen}
        initialReviewMonth={reviewMonth}
      />
    </Providers>
  );
}
