import { describe, expect, it } from "vitest";
import { buildNextCheckpoint } from "../src/checkpoint.js";
import type { CheckpointState } from "../src/types.js";

describe("buildNextCheckpoint", () => {
  it("advances window end and latest repo sha", () => {
    const current: CheckpointState = {
      version: 1,
      lastSuccessfulRunIso: "2026-02-28T00:00:00.000Z",
      perRepoLastSeenSha: {}
    };

    const next = buildNextCheckpoint(
      current,
      {
        startIso: "2026-02-28T00:00:00.000Z",
        endIso: "2026-03-01T00:00:00.000Z"
      },
      {
        "acme/repo1": [
          {
            sha: "old",
            repo: "acme/repo1",
            authorEmail: "a@a.com",
            authorLogin: "a",
            date: "2026-02-28T10:00:00.000Z",
            message: "m1",
            url: "https://example.com/1",
            files: []
          },
          {
            sha: "new",
            repo: "acme/repo1",
            authorEmail: "a@a.com",
            authorLogin: "a",
            date: "2026-02-28T12:00:00.000Z",
            message: "m2",
            url: "https://example.com/2",
            files: []
          }
        ]
      }
    );

    expect(next.lastSuccessfulRunIso).toBe("2026-03-01T00:00:00.000Z");
    expect(next.perRepoLastSeenSha["acme/repo1"]).toBe("new");
  });
});
