import OpenAI from "openai";
import type { AgentConfig, CommitRecord, RepoReport } from "./types.js";
import { redactSecrets } from "./utils/redact.js";
import { withRetry } from "./utils/retry.js";

const CHUNK_CHAR_LIMIT = 18_000;

interface RepoChunkSummary {
  highlights: string[];
  risks: string[];
  detailedNotes: string;
}

interface ExecutiveSummary {
  bullets: string[];
  topHighlight: string;
}

function chunkByLength(items: string[], maxLength: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const item of items) {
    if ((current + item).length > maxLength && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current += `${item}\n`;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function safeJsonParse<T>(input: string): T | null {
  const trimmed = input.trim();
  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

function uniqueTrimmed(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of items) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    if (seen.has(value.toLowerCase())) {
      continue;
    }
    seen.add(value.toLowerCase());
    output.push(value);
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function commitToPromptText(commit: CommitRecord): string {
  const fileSummary = commit.files
    .slice(0, 15)
    .map((file) => {
      const patch = file.patch ? `\npatch:\n${file.patch}` : "";
      return `${file.filename} (${file.status}, +${file.additions}/-${file.deletions})${patch}`;
    })
    .join("\n");

  return redactSecrets([
    `repo: ${commit.repo}`,
    `sha: ${commit.sha}`,
    `date: ${commit.date}`,
    `author_email: ${commit.authorEmail}`,
    `author_username: ${commit.authorLogin}`,
    `message: ${commit.message}`,
    `url: ${commit.url}`,
    `files:\n${fileSummary}`
  ].join("\n"));
}

function extractOutputText(response: unknown): string {
  if (typeof response !== "object" || !response) {
    return "";
  }

  const direct = (response as { output_text?: unknown }).output_text;
  if (typeof direct === "string") {
    return direct;
  }

  const output = (response as { output?: unknown[] }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") {
        chunks.push(text);
      }
    }
  }
  return chunks.join("\n");
}

async function modelJson<T>(
  client: OpenAI,
  model: string,
  maxTokens: number,
  system: string,
  user: string,
  fallback: T
): Promise<T> {
  const response = await withRetry(() =>
    client.responses.create({
      model,
      max_output_tokens: maxTokens,
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  );

  const outputText = extractOutputText(response);
  const parsed = safeJsonParse<T>(outputText);
  if (!parsed) {
    return fallback;
  }
  return parsed;
}

export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

export async function summarizeRepoChanges(
  client: OpenAI,
  config: AgentConfig["openai"],
  repo: string,
  commits: CommitRecord[]
): Promise<RepoReport> {
  if (commits.length === 0) {
    return {
      repo,
      commitCount: 0,
      highlights: ["No matching changes in this window."],
      risks: [],
      detailedNotes: ""
    };
  }

  const chunks = chunkByLength(commits.map(commitToPromptText), CHUNK_CHAR_LIMIT);
  const chunkSummaries: RepoChunkSummary[] = [];

  for (const chunk of chunks) {
    const fallback: RepoChunkSummary = {
      highlights: ["Changes detected, but structured summary parsing failed."],
      risks: [],
      detailedNotes: chunk.slice(0, 4_000)
    };

    const summary = await modelJson<RepoChunkSummary>(
      client,
      config.model,
      config.maxTokens,
      "You analyze git changes and respond ONLY valid JSON with keys: highlights(string[]), risks(string[]), detailedNotes(string).",
      [
        `Repository: ${repo}`,
        "Summarize this change chunk into concise engineering notes.",
        "Highlight architecture-impacting changes and rollout risks if any.",
        "Chunk:",
        chunk
      ].join("\n\n"),
      fallback
    );

    chunkSummaries.push({
      highlights: Array.isArray(summary.highlights) ? summary.highlights : fallback.highlights,
      risks: Array.isArray(summary.risks) ? summary.risks : fallback.risks,
      detailedNotes: typeof summary.detailedNotes === "string" ? summary.detailedNotes : fallback.detailedNotes
    });
  }

  return {
    repo,
    commitCount: commits.length,
    highlights: uniqueTrimmed(chunkSummaries.flatMap((item) => item.highlights), 8),
    risks: uniqueTrimmed(chunkSummaries.flatMap((item) => item.risks), 6),
    detailedNotes: chunkSummaries
      .map((item, index) => `Chunk ${index + 1}\n${item.detailedNotes.trim()}`)
      .join("\n\n")
      .trim()
  };
}

export async function summarizeExecutive(
  client: OpenAI,
  config: AgentConfig["openai"],
  repoReports: RepoReport[],
  totalCommitCount: number,
  totalRepoCount: number
): Promise<ExecutiveSummary> {
  if (repoReports.length === 0) {
    return {
      bullets: ["No matching author commits were found in this reporting window."],
      topHighlight: "No matching changes"
    };
  }

  const repoBrief = repoReports
    .map(
      (report) =>
        `repo=${report.repo}; commits=${report.commitCount}; highlights=${report.highlights.join(" | ")}; risks=${report.risks.join(" | ")}`
    )
    .join("\n");

  const fallback: ExecutiveSummary = {
    bullets: repoReports.slice(0, 8).map((report) => `${report.repo}: ${report.highlights[0] ?? "Changes detected."}`),
    topHighlight: repoReports[0]?.highlights[0] ?? "Changes detected"
  };

  const summary = await modelJson<ExecutiveSummary>(
    client,
    config.model,
    config.maxTokens,
    "You produce concise executive engineering updates. Respond ONLY valid JSON with keys bullets(string[]) and topHighlight(string).",
    [
      `Totals: commits=${totalCommitCount}, repos=${totalRepoCount}`,
      "Generate 5-10 bullets with operationally important updates.",
      "Keep each bullet <= 140 characters and avoid markdown.",
      "Repo reports:",
      repoBrief
    ].join("\n\n"),
    fallback
  );

  const bullets = Array.isArray(summary.bullets) ? summary.bullets : fallback.bullets;
  const topHighlight = typeof summary.topHighlight === "string" ? summary.topHighlight : fallback.topHighlight;

  return {
    bullets: uniqueTrimmed(bullets, 10),
    topHighlight: topHighlight.trim() || fallback.topHighlight
  };
}
