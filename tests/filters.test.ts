import { describe, expect, it } from "vitest";
import { buildAuthorFilter, matchesAuthor } from "../src/github/changes.js";

describe("author filters", () => {
  const filter = buildAuthorFilter({
    emails: ["me@example.com"],
    usernames: ["my-user"]
  });

  it("matches by email", () => {
    expect(matchesAuthor("me@example.com", null, filter)).toBe(true);
  });

  it("matches by username", () => {
    expect(matchesAuthor(null, "my-user", filter)).toBe(true);
  });

  it("rejects unrelated author", () => {
    expect(matchesAuthor("other@example.com", "other", filter)).toBe(false);
  });
});
