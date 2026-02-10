import "server-only";

import { getEnv } from "@/lib/env";

interface ClaudeMessage {
  role: "user";
  content: string;
}

interface ClaudeOptions {
  maxTokens?: number;
  temperature?: number;
}

export async function callClaude(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<{ text: string; stopReason?: string | null }> {
  const env = getEnv();
  const model = env.CLAUDE_MODEL?.trim() || "claude-opus-4-6";
  const maxTokens = options.maxTokens ?? env.CLAUDE_MAX_TOKENS ?? 8192;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.4,
      messages: [{ role: "user", content: prompt } as ClaudeMessage]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude request failed: ${text}`);
  }

  const data = await res.json();
  return {
    text: data?.content?.[0]?.text ?? "",
    stopReason: data?.stop_reason ?? null
  };
}
