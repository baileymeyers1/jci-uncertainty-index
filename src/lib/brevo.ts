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

export async function syncRecipientsToList(recipients: { email: string; name?: string | null }[]) {
  const env = getEnv();
  await brevoClient().post("/contacts", {
    listIds: [Number(env.BREVO_LIST_ID)],
    updateEnabled: true,
    contacts: recipients.map((recipient) => ({
      email: recipient.email,
      attributes: recipient.name ? { FIRSTNAME: recipient.name } : undefined
    }))
  });
}

export async function createCampaign(params: {
  name: string;
  subject: string;
  html: string;
  scheduledAt?: string;
}) {
  const env = getEnv();
  const res = await brevoClient().post("/emailCampaigns", {
    name: params.name,
    subject: params.subject,
    sender: { email: env.BREVO_SENDER_EMAIL, name: env.BREVO_SENDER_NAME },
    type: "classic",
    htmlContent: params.html,
    recipients: { listIds: [Number(env.BREVO_LIST_ID)] },
    scheduledAt: params.scheduledAt
  });

  return res.data;
}

export async function sendCampaignNow(campaignId: string) {
  await brevoClient().post(`/emailCampaigns/${campaignId}/sendNow`);
}

export async function deleteCampaign(campaignId: string) {
  await brevoClient().delete(`/emailCampaigns/${campaignId}`);
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
