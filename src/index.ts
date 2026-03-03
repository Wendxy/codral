import { AGENT_SKILLS, AGENT_TOOLS } from "./agent/catalog.js";
import { runAgentGraph } from "./agent/graph.js";

function printCapabilities(): void {
  console.log("Agent tools:");
  for (const tool of AGENT_TOOLS) {
    console.log(`- ${tool.name}: ${tool.purpose}`);
  }

  console.log("Agent skills:");
  for (const skill of AGENT_SKILLS) {
    console.log(`- ${skill.name}: ${skill.purpose}`);
  }
}

async function main(): Promise<void> {
  printCapabilities();
  const result = await runAgentGraph();

  if (result.shouldRun === false) {
    console.log(result.skipReason ?? "Run skipped by time gate");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error("Run failed:", message);
  process.exitCode = 1;
});
