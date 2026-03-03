import { describe, expect, it } from "vitest";
import { dedupeCommits } from "../src/report.js";

describe("dedupeCommits", () => {
  it("deduplicates by repo and sha", () => {
    const deduped = dedupeCommits([
      {
        sha: "abc",
        repo: "org/repo",
        authorEmail: "a@a.com",
        authorLogin: "a",
        date: "2026-02-01T00:00:00.000Z",
        message: "m",
        url: "u",
        files: []
      },
      {
        sha: "abc",
        repo: "org/repo",
        authorEmail: "a@a.com",
        authorLogin: "a",
        date: "2026-02-01T00:00:00.000Z",
        message: "m",
        url: "u",
        files: []
      }
    ]);

    expect(deduped).toHaveLength(1);
  });
});
