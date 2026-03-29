import { createError, getQuery } from "h3";
import env from "~/server/env";
import { adminPostmarkMessagesQuerySchema } from "~/schema/zod";
import { requireAdmin } from "~/server/lib/requireAdmin";
import { handleApiError } from "~/server/lib/handleApiError";

type PostmarkToRecipient = { Email?: string; Name?: string | null };

type PostmarkOutboundMessage = {
  MessageID: string;
  Tag?: string;
  To?: string | PostmarkToRecipient[];
  Cc?: unknown;
  Bcc?: unknown;
  Recipients?: string[];
  Subject?: string;
  Status?: string;
  ReceivedAt?: string;
};

function formatRecipients(m: PostmarkOutboundMessage): string {
  if (Array.isArray(m.Recipients) && m.Recipients.length > 0) {
    return m.Recipients.join(", ");
  }
  if (typeof m.To === "string") return m.To;
  if (Array.isArray(m.To)) {
    return m.To.map((x) => x?.Email ?? "").filter(Boolean).join(", ");
  }
  return "";
}

type PostmarkOutboundResponse = {
  TotalCount: number;
  Messages: PostmarkOutboundMessage[];
};

export default defineEventHandler(async (event) => {
  try {
    await requireAdmin(event);
    const q = adminPostmarkMessagesQuerySchema.parse(getQuery(event));

    const token = env?.POSTMARK_SERVER_TOKEN?.trim();
    if (!token) {
      throw createError({
        statusCode: 503,
        statusMessage: "Postmark server token is not configured",
      });
    }

    const url = new URL("https://api.postmarkapp.com/messages/outbound");
    url.searchParams.set("recipient", q.recipient);
    url.searchParams.set("count", String(q.count));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Postmark-Server-Token": token,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw createError({
        statusCode: res.status >= 400 && res.status < 600 ? res.status : 502,
        statusMessage: `Postmark API error: ${text.slice(0, 200)}`,
      });
    }

    const body = (await res.json()) as PostmarkOutboundResponse;

    return {
      totalCount: body.TotalCount ?? 0,
      messages: (body.Messages ?? []).map((m) => ({
        messageId: m.MessageID,
        to: formatRecipients(m),
        subject: m.Subject ?? "",
        status: m.Status ?? "",
        receivedAt: m.ReceivedAt ?? "",
        tag: m.Tag ?? "",
      })),
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
});
