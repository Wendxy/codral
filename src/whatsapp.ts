import { withRetry } from "./utils/retry.js";

export interface WhatsAppPayload {
  accessToken: string;
  phoneNumberId: string;
  recipient: string;
  templateName: string;
  languageCode: string;
  dateLabel: string;
  commitCount: number;
  repoCount: number;
  topHighlight: string;
  notionUrl: string;
  dryRun: boolean;
}

export async function sendWhatsAppSummary(payload: WhatsAppPayload): Promise<void> {
  if (payload.dryRun) {
    return;
  }

  const endpoint = `https://graph.facebook.com/v21.0/${payload.phoneNumberId}/messages`;

  await withRetry(async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${payload.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: payload.recipient,
        type: "template",
        template: {
          name: payload.templateName,
          language: { code: payload.languageCode },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: payload.dateLabel },
                { type: "text", text: String(payload.commitCount) },
                { type: "text", text: String(payload.repoCount) },
                { type: "text", text: payload.topHighlight.slice(0, 120) || "No major highlight" },
                { type: "text", text: payload.notionUrl }
              ]
            }
          ]
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`WhatsApp API failed (${response.status}): ${body}`) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }
  });
}
