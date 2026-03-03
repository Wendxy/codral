import { describe, expect, it } from "vitest";
import { AGENT_SKILLS, AGENT_TOOLS } from "../src/agent/catalog.js";

describe("agent catalog", () => {
  it("defines clear tools", () => {
    expect(AGENT_TOOLS.length).toBeGreaterThanOrEqual(5);
    expect(AGENT_TOOLS.some((tool) => tool.name.includes("GitHub"))).toBe(true);
    expect(AGENT_TOOLS.some((tool) => tool.name.includes("OpenAI"))).toBe(true);
    expect(AGENT_TOOLS.some((tool) => tool.name.includes("Notion"))).toBe(true);
    expect(AGENT_TOOLS.some((tool) => tool.name.includes("WhatsApp"))).toBe(true);
  });

  it("defines clear skills", () => {
    expect(AGENT_SKILLS.length).toBeGreaterThanOrEqual(6);
    expect(AGENT_SKILLS.some((skill) => skill.name.includes("Time Gate"))).toBe(true);
    expect(AGENT_SKILLS.some((skill) => skill.name.includes("Change Analysis"))).toBe(true);
  });
});
