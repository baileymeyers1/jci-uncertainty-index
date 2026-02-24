import "server-only";

import axios from "axios";
import { getEnv } from "@/lib/env";

function brevoClient() {
  const env = getEnv();
  return axios.create({
    baseURL: "https://api.brevo.com/v3",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json"
    }
  });
}

export async function sendAdminAlert(subject: string, html: string) {
  const env = getEnv();
  await brevoClient().post("/smtp/email", {
    sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
    to: [{ email: env.ADMIN_ALERT_EMAIL }],
    subject,
    htmlContent: html
  });
}

export async function sendTransactionalEmail(params: {
  subject: string;
  html: string;
  to: { email: string; name?: string | null }[];
}) {
  const env = getEnv();
  await brevoClient().post("/smtp/email", {
    sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
    to: params.to.map((recipient) => ({
      email: recipient.email,
      name: recipient.name ?? undefined
    })),
    subject: params.subject,
    htmlContent: params.html
  });
}
