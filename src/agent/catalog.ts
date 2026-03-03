export interface AgentTool {
  name: string;
  purpose: string;
}

export interface AgentSkill {
  name: string;
  purpose: string;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "GitHub Octokit API",
    purpose: "Discover repositories and fetch commits/files for the reporting window."
  },
  {
    name: "OpenAI Responses API",
    purpose: "Generate per-repo documentation and executive summary."
  },
  {
    name: "Notion API",
    purpose: "Create the structured daily report in your Notion database."
  },
  {
    name: "WhatsApp Cloud API",
    purpose: "Send executive summary alert with Notion link to one recipient."
  },
  {
    name: "Checkpoint JSON Store",
    purpose: "Persist last successful run window and per-repo latest seen commit."
  }
];

export const AGENT_SKILLS: AgentSkill[] = [
  {
    name: "Time Gate Skill",
    purpose: "Run only during midnight hour in Australia/Sydney unless force-run is enabled."
  },
  {
    name: "GitHub Scan Skill",
    purpose: "Find org repositories, filter by include/exclude rules, and collect author-matching commits."
  },
  {
    name: "Change Analysis Skill",
    purpose: "Transform commits and patches into technical documentation and executive bullets."
  },
  {
    name: "Notion Publishing Skill",
    purpose: "Write the daily report with metadata, commit index, key files, and repo-level details."
  },
  {
    name: "WhatsApp Notification Skill",
    purpose: "Send a concise summary notification with report URL."
  },
  {
    name: "Checkpoint Skill",
    purpose: "Advance checkpoint only after successful end-to-end execution."
  }
];
