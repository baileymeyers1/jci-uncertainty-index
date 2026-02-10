import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8),
  GOOGLE_SHEETS_CLIENT_EMAIL: z.string().email(),
  GOOGLE_SHEETS_PRIVATE_KEY: z.string().min(1),
  GOOGLE_SHEET_ID: z.string().min(1),
  CLAUDE_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().min(1).optional(),
  BRAVE_API_KEY: z.string().min(1),
  FRED_API_KEY: z.string().min(1),
  BREVO_API_KEY: z.string().min(1),
  BREVO_SENDER_EMAIL: z.string().email(),
  BREVO_SENDER_NAME: z.string().min(1),
  BREVO_LIST_ID: z.string().min(1),
  ADMIN_ALERT_EMAIL: z.string().email(),
  CRON_SECRET: z.string().min(1)
});

const authSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(1),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8)
});

let cachedEnv: z.infer<typeof envSchema> | null = null;
let cachedAuthEnv: z.infer<typeof authSchema> | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}

export function getAuthEnv() {
  if (!cachedAuthEnv) {
    cachedAuthEnv = authSchema.parse(process.env);
  }
  return cachedAuthEnv;
}
