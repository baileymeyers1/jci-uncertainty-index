import "server-only";

import { getEnv } from "@/lib/env";

interface ClaudeMessage {
  role: "user";
  content: string;
}

export async function callClaude(prompt: string): Promise<string> {
  const env = getEnv();
  const model = env.CLAUDE_MODEL?.trim() || "claude-opus-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt } as ClaudeMessage]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude request failed: ${text}`);
  }

  const data = await res.json();
  return data?.content?.[0]?.text ?? "";
}
