import { describe, expect, it } from "vitest";
import { createDailyNotionEntry } from "../src/notion.js";

describe("createDailyNotionEntry dry-run", () => {
  it("returns dry run url", async () => {
    const result = await createDailyNotionEntry(
      "token",
      "db",
      {
        dateLocal: "2026-03-03",
        window: {
          startIso: "2026-03-02T00:00:00.000Z",
          endIso: "2026-03-03T00:00:00.000Z"
        },
        totals: {
          repoCount: 1,
          commitCount: 2
        },
        repoReports: [],
        executiveSummary: ["Summary"],
        notionUrl: ""
      },
      {},
      "run-1",
      true
    );

    expect(result).toBe("dry-run://notion/2026-03-03");
  });
});
