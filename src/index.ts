import { DateTime } from "luxon";
import { buildNextCheckpoint, loadCheckpoint, saveCheckpoint } from "./checkpoint.js";
import { loadConfig, loadRuntimeEnv } from "./config.js";
import { collectRepoCommits, buildAuthorFilter } from "./github/changes.js";
import { createGitHubClient } from "./github/client.js";
import { discoverRepositories } from "./github/discovery.js";
import { createDailyNotionEntry } from "./notion.js";
import { dedupeCommits } from "./report.js";
import { createOpenAiClient, summarizeExecutive, summarizeRepoChanges } from "./summarizer.js";
import type { CommitRecord, DailyReport } from "./types.js";
import { asyncPool } from "./utils/asyncPool.js";
import { getRunWindowStart, getSydneyDateLabel, isSydneyMidnight } from "./utils/time.js";
import { sendWhatsAppSummary } from "./whatsapp.js";

const REPO_SCAN_CONCURRENCY = 3;
const SUMMARY_CONCURRENCY = 2;

async function main(): Promise<void> {
  const env = loadRuntimeEnv();
  const config = await loadConfig();
  const nowUtc = DateTime.utc();

  if (!env.forceRun && !isSydneyMidnight(nowUtc)) {
    console.log("Skipping run: current time is not midnight in Australia/Sydney");
    return;
  }

  const checkpoint = await loadCheckpoint();
  const window = {
    startIso: getRunWindowStart(checkpoint.lastSuccessfulRunIso, nowUtc),
    endIso: nowUtc.toUTC().toISO() ?? new Date().toISOString()
  };

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

  const openai = createOpenAiClient(env.openaiApiKey);

  const repoEntries = Object.entries(commitsByRepo);
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
    dateLocal: getSydneyDateLabel(nowUtc),
    window,
    totals: {
      repoCount: repoReports.length,
      commitCount: totalCommitCount
    },
    repoReports,
    executiveSummary: executive.bullets,
    notionUrl: ""
  };

  const runId = process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`;

  const notionUrl = await createDailyNotionEntry(
    env.notionToken,
    config.notion.databaseId,
    report,
    commitsByRepo,
    runId,
    env.dryRun
  );

  report.notionUrl = notionUrl;

  await sendWhatsAppSummary({
    accessToken: env.whatsappAccessToken,
    phoneNumberId: env.whatsappPhoneNumberId,
    recipient: config.whatsapp.recipient,
    templateName: config.whatsapp.templateName,
    languageCode: config.whatsapp.languageCode,
    dateLabel: report.dateLocal,
    commitCount: report.totals.commitCount,
    repoCount: report.totals.repoCount,
    topHighlight: executive.topHighlight,
    notionUrl,
    dryRun: env.dryRun
  });

  console.log(JSON.stringify(report, null, 2));

  if (!env.dryRun) {
    const nextCheckpoint = buildNextCheckpoint(checkpoint, window, commitsByRepo);
    await saveCheckpoint(nextCheckpoint);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error("Run failed:", message);
  process.exitCode = 1;
});
