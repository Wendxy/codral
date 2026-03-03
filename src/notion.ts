import { Client } from "@notionhq/client";
import type { CommitRecord, DailyReport } from "./types.js";
import { withRetry } from "./utils/retry.js";

function truncate(input: string, max = 1900): string {
  if (input.length <= max) {
    return input;
  }
  return `${input.slice(0, max - 14)}...[truncated]`;
}

function toBullets(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

export async function createDailyNotionEntry(
  notionToken: string,
  databaseId: string,
  report: DailyReport,
  commitsByRepo: Record<string, CommitRecord[]>,
  runId: string,
  dryRun: boolean
): Promise<string> {
  if (dryRun) {
    return `dry-run://notion/${report.dateLocal}`;
  }

  const notion = new Client({ auth: notionToken });

  const topRepos = [...report.repoReports]
    .sort((a, b) => b.commitCount - a.commitCount)
    .slice(0, 5)
    .map((repo) => repo.repo)
    .join(", ");

  const commitIndex = Object.entries(commitsByRepo)
    .flatMap(([repo, commits]) =>
      commits.slice(0, 20).map((commit) => `- ${repo} ${commit.sha.slice(0, 8)} ${truncate(commit.message, 90)} ${commit.url}`)
    )
    .slice(0, 120);

  const keyFiles = Object.values(commitsByRepo)
    .flatMap((commits) => commits)
    .flatMap((commit) => commit.files.map((file) => file.filename))
    .filter(Boolean)
    .slice(0, 200);

  const distinctKeyFiles = [...new Set(keyFiles)].slice(0, 80).map((file) => `- ${file}`);

  const page = await withRetry(() =>
    notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Date: {
          date: {
            start: report.dateLocal
          }
        },
        "Window Start": {
          rich_text: [{ text: { content: report.window.startIso } }]
        },
        "Window End": {
          rich_text: [{ text: { content: report.window.endIso } }]
        },
        "Repo Count": {
          number: report.totals.repoCount
        },
        "Commit Count": {
          number: report.totals.commitCount
        },
        Status: {
          select: {
            name: "Success"
          }
        },
        "Run ID": {
          rich_text: [{ text: { content: runId } }]
        },
        "Top Repos": {
          rich_text: [{ text: { content: truncate(topRepos || "None") } }]
        }
      },
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: "Executive Summary" } }]
          }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: truncate(toBullets(report.executiveSummary)) } }]
          }
        },
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: "Repository Details" } }]
          }
        },
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: "Commit Index" } }]
          }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: truncate(commitIndex.join("\n") || "- No commits") } }]
          }
        },
        {
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [{ type: "text", text: { content: "Key Files Changed" } }]
          }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: truncate(distinctKeyFiles.join("\n") || "- None") } }]
          }
        },
        ...report.repoReports.slice(0, 25).flatMap((repo) => [
          {
            object: "block" as const,
            type: "heading_3" as const,
            heading_3: {
              rich_text: [
                {
                  type: "text" as const,
                  text: { content: `${repo.repo} (${repo.commitCount} commits)` }
                }
              ]
            }
          },
          {
            object: "block" as const,
            type: "paragraph" as const,
            paragraph: {
              rich_text: [
                {
                  type: "text" as const,
                  text: {
                    content: truncate(`Highlights\n${toBullets(repo.highlights)}\n\nRisks\n${toBullets(repo.risks)}\n\nNotes\n${repo.detailedNotes}`)
                  }
                }
              ]
            }
          }
        ])
      ]
    })
  );

  await withRetry(async () => {
    try {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          "Notion URL": {
            url: page.url
          }
        }
      });
    } catch {
      // Some databases will not have this optional property.
    }
  });

  return page.url;
}
