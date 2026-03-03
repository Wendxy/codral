import { DateTime } from "luxon";
import { buildNextCheckpoint, loadCheckpoint, saveCheckpoint } from "../checkpoint.js";
import { loadConfig, loadRuntimeEnv } from "../config.js";
import { buildAuthorFilter, collectRepoCommits } from "../github/changes.js";
import { createGitHubClient } from "../github/client.js";
import { discoverRepositories } from "../github/discovery.js";
import { createDailyNotionEntry } from "../notion.js";
import { dedupeCommits } from "../report.js";
import { createOpenAiClient, summarizeExecutive, summarizeRepoChanges } from "../summarizer.js";
import type { AgentConfig, CheckpointState, CommitRecord, DailyReport, RepoReport, RunWindow, RuntimeEnv } from "../types.js";
import { asyncPool } from "../utils/asyncPool.js";
import { getRunWindowStart, getSydneyDateLabel, isSydneyMidnight } from "../utils/time.js";
import { sendWhatsAppSummary } from "../whatsapp.js";

const REPO_SCAN_CONCURRENCY = 3;
const SUMMARY_CONCURRENCY = 2;

interface ExecutiveSummaryState {
  bullets: string[];
  topHighlight: string;
}

export interface AgentGraphState {
  env?: RuntimeEnv;
  nowUtcIso?: string;
  runId?: string;
  shouldRun?: boolean;
  skipReason?: string | null;
  config?: AgentConfig;
  checkpoint?: CheckpointState;
  window?: RunWindow;
  commitsByRepo?: Record<string, CommitRecord[]>;
  repoReports?: RepoReport[];
  executive?: ExecutiveSummaryState;
  report?: DailyReport;
  notionUrl?: string;
}

type AgentGraphUpdate = Partial<AgentGraphState>;
type AgentNode = (state: AgentGraphState) => Promise<AgentGraphUpdate>;

function ensureStateValue<T>(value: T | undefined, field: keyof AgentGraphState): T {
  if (value === undefined || value === null) {
    throw new Error(`Missing required graph state: ${String(field)}`);
  }
  return value;
}

function applyUpdate(state: AgentGraphState, update: AgentGraphUpdate): AgentGraphState {
  return {
    ...state,
    ...update
  };
}

async function loadRuntimeNode(): Promise<AgentGraphUpdate> {
  const env = loadRuntimeEnv();
  const nowUtcIso = DateTime.utc().toUTC().toISO() ?? new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;

  return { env, nowUtcIso, runId };
}

async function timeGateNode(state: AgentGraphState): Promise<AgentGraphUpdate> {
  const env = ensureStateValue(state.env, "env");
  const nowUtcIso = ensureStateValue(state.nowUtcIso, "nowUtcIso");
  const nowUtc = DateTime.fromISO(nowUtcIso, { zone: "utc" });

  const shouldRun = env.forceRun || isSydneyMidnight(nowUtc);
  if (!shouldRun) {
    const skipReason = "Skipping run: current time is not midnight hour in Australia/Sydney";
    console.log(skipReason);
    return { shouldRun: false, skipReason };
  }

  return { shouldRun: true, skipReason: null };
}

async function setupNode(state: AgentGraphState): Promise<AgentGraphUpdate> {
  if (state.shouldRun === false) {
    return {};
  }

  const nowUtcIso = ensureStateValue(state.nowUtcIso, "nowUtcIso");
  const nowUtc = DateTime.fromISO(nowUtcIso, { zone: "utc" });

  const [config, checkpoint] = await Promise.all([loadConfig(), loadCheckpoint()]);
  const window: RunWindow = {
    startIso: getRunWindowStart(checkpoint.lastSuccessfulRunIso, nowUtc),
    endIso: nowUtc.toUTC().toISO() ?? nowUtcIso
  };

  return { config, checkpoint, window };
}

async function collectChangesNode(state: AgentGraphState): Promise<AgentGraphUpdate> {
  if (state.shouldRun === false) {
    return {};
  }

  const env = ensureStateValue(state.env, "env");
  const config = ensureStateValue(state.config, "config");
  const window = ensureStateValue(state.window, "window");

  const github = createGitHubClient(env.githubToken);
  const repos = await discoverRepositories(github, config.github);
  const authorFilter = buildAuthorFilter(config.authors);

  const commitResults = await asyncPool(repos, REPO_SCAN_CONCURRENCY, async (repo) => {
    const commits = await collectRepoCommits(github, repo, window, authorFilter);
    const deduped = dedupeCommits(commits);
    return { repo: repo.fullName, commits: deduped };
  });

  const commitsByRepo: Record<string, CommitRecord[]> = {};
  for (const result of commitResults) {
    if (result.commits.length > 0) {
      commitsByRepo[result.repo] = result.commits;
    }
  }

  return { commitsByRepo };
}

async function summarizeNode(state: AgentGraphState): Promise<AgentGraphUpdate> {
  if (state.shouldRun === false) {
    return {};
  }

  const env = ensureStateValue(state.env, "env");
  const config = ensureStateValue(state.config, "config");
  const commitsByRepo = state.commitsByRepo ?? {};
  const nowUtcIso = ensureStateValue(state.nowUtcIso, "nowUtcIso");
  const window = ensureStateValue(state.window, "window");

  const openai = createOpenAiClient(env.openaiApiKey);
  const repoEntries: Array<[string, CommitRecord[]]> = Object.entries(commitsByRepo);

  const repoReports = await asyncPool(repoEntries, SUMMARY_CONCURRENCY, ([repo, commits]) =>
    summarizeRepoChanges(openai, config.openai, repo, commits)
  );

  repoReports.sort((a, b) => b.commitCount - a.commitCount);

  const totalCommitCount = Object.values(commitsByRepo).reduce((sum, commits) => sum + commits.length, 0);
  const executive = await summarizeExecutive(
    openai,
    config.openai,
    repoReports,
    totalCommitCount,
    repoReports.length
  );

  const report: DailyReport = {
    dateLocal: getSydneyDateLabel(DateTime.fromISO(nowUtcIso, { zone: "utc" })),
    window,
    totals: {
      repoCount: repoReports.length,
      commitCount: totalCommitCount
    },
    repoReports,
    executiveSummary: executive.bullets,
    notionUrl: ""
  };

  return { repoReports, executive, report };
}

async function publishNode(state: AgentGraphState): Promise<AgentGraphUpdate> {
  if (state.shouldRun === false) {
    return {};
  }

  const env = ensureStateValue(state.env, "env");
  const config = ensureStateValue(state.config, "config");
  const runId = ensureStateValue(state.runId, "runId");
  const report = ensureStateValue(state.report, "report");
  const commitsByRepo = state.commitsByRepo ?? {};
  const executive = ensureStateValue(state.executive, "executive");

  const notionUrl = await createDailyNotionEntry(
    env.notionToken,
    config.notion.databaseId,
    report,
    commitsByRepo,
    runId,
    env.dryRun
  );

  const updatedReport: DailyReport = {
    ...report,
    notionUrl
  };

  await sendWhatsAppSummary({
    accessToken: env.whatsappAccessToken,
    phoneNumberId: env.whatsappPhoneNumberId,
    recipient: config.whatsapp.recipient,
    templateName: config.whatsapp.templateName,
    languageCode: config.whatsapp.languageCode,
    dateLabel: updatedReport.dateLocal,
    commitCount: updatedReport.totals.commitCount,
    repoCount: updatedReport.totals.repoCount,
    topHighlight: executive.topHighlight,
    notionUrl,
    dryRun: env.dryRun
  });

  console.log(JSON.stringify(updatedReport, null, 2));
  return { notionUrl, report: updatedReport };
}

async function checkpointNode(state: AgentGraphState): Promise<AgentGraphUpdate> {
  if (state.shouldRun === false) {
    return {};
  }

  const env = ensureStateValue(state.env, "env");
  if (env.dryRun) {
    console.log("Dry run enabled: skipping checkpoint save");
    return {};
  }

  const checkpoint = ensureStateValue(state.checkpoint, "checkpoint");
  const window = ensureStateValue(state.window, "window");
  const commitsByRepo = state.commitsByRepo ?? {};

  const nextCheckpoint = buildNextCheckpoint(checkpoint, window, commitsByRepo);
  await saveCheckpoint(nextCheckpoint);

  return { checkpoint: nextCheckpoint };
}

const NODE_SEQUENCE: AgentNode[] = [
  loadRuntimeNode,
  timeGateNode,
  setupNode,
  collectChangesNode,
  summarizeNode,
  publishNode,
  checkpointNode
];

async function runSequentialGraph(initial: AgentGraphState): Promise<AgentGraphState> {
  let state = initial;
  for (const node of NODE_SEQUENCE) {
    const update = await node(state);
    state = applyUpdate(state, update);
  }
  return state;
}

async function runWithLangGraph(initial: AgentGraphState): Promise<AgentGraphState> {
  const langgraph = await import("@langchain/langgraph");
  const { Annotation, StateGraph, START, END } = langgraph;

  const runtimeState = Annotation.Root({
    env: Annotation(),
    nowUtcIso: Annotation(),
    runId: Annotation(),
    shouldRun: Annotation(),
    skipReason: Annotation(),
    config: Annotation(),
    checkpoint: Annotation(),
    window: Annotation(),
    commitsByRepo: Annotation(),
    repoReports: Annotation(),
    executive: Annotation(),
    report: Annotation(),
    notionUrl: Annotation()
  });

  const graph = new StateGraph(runtimeState)
    .addNode("loadRuntime", loadRuntimeNode)
    .addNode("timeGate", timeGateNode)
    .addNode("setup", setupNode)
    .addNode("collectChanges", collectChangesNode)
    .addNode("summarize", summarizeNode)
    .addNode("publish", publishNode)
    .addNode("checkpoint", checkpointNode)
    .addEdge(START, "loadRuntime")
    .addEdge("loadRuntime", "timeGate")
    .addEdge("timeGate", "setup")
    .addEdge("setup", "collectChanges")
    .addEdge("collectChanges", "summarize")
    .addEdge("summarize", "publish")
    .addEdge("publish", "checkpoint")
    .addEdge("checkpoint", END)
    .compile();

  return graph.invoke(initial);
}

export async function runAgentGraph(): Promise<AgentGraphState> {
  const initial: AgentGraphState = {};

  try {
    return await runWithLangGraph(initial);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`LangGraph unavailable, using sequential fallback: ${message}`);
    return runSequentialGraph(initial);
  }
}
