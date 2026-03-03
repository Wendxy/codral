import { describe, expect, it } from "vitest";
import { redactSecrets } from "../src/utils/redact.js";

describe("redactSecrets", () => {
  it("redacts common token patterns", () => {
    const source = "token=ghp_abcdefghijklmnopqrstuvwxyz123456";
    const output = redactSecrets(source);
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("ghp_");
  });
});
