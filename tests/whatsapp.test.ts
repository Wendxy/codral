import { describe, expect, it, vi } from "vitest";
import { sendWhatsAppSummary } from "../src/whatsapp.js";

describe("sendWhatsAppSummary", () => {
  it("noops in dry run", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendWhatsAppSummary({
      accessToken: "token",
      phoneNumberId: "123",
      recipient: "61400000000",
      templateName: "daily_summary",
      languageCode: "en",
      dateLabel: "2026-03-03",
      commitCount: 3,
      repoCount: 2,
      topHighlight: "Updated pipeline",
      notionUrl: "https://notion.so/test",
      dryRun: true
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
