import "server-only";

import { getEnv } from "@/lib/env";

interface BraveResult {
  title: string;
  url: string;
  description: string;
}

export async function braveSearch(query: string): Promise<BraveResult[]> {
  const env = getEnv();
  const params = new URLSearchParams({
    q: query,
    source: "web",
    count: "5"
  });

  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": env.BRAVE_API_KEY
    }
  });

  if (!res.ok) {
    throw new Error(`Brave search failed (${res.status})`);
  }

  const data = await res.json();
  const results = data?.web?.results ?? [];

  return results.map((item: any) => ({
    title: item.title,
    url: item.url,
    description: item.description
  }));
}
