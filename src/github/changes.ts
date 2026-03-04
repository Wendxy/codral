import type { Octokit } from "@octokit/rest";
import type { AgentConfig, CommitRecord, RepoTarget, RunWindow } from "../types.js";
import { withRetry } from "../utils/retry.js";
import { redactSecrets } from "../utils/redact.js";

interface AuthorFilter {
  emails: Set<string>;
  usernames: Set<string>;
}

function splitFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository name: ${fullName}`);
  }
  return { owner, repo };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim();
}

export function buildAuthorFilter(authors: AgentConfig["authors"]): AuthorFilter {
  return {
    emails: new Set(authors.emails.map((value) => normalize(value)).filter(Boolean)),
    usernames: new Set(authors.usernames.map((value) => normalize(value)).filter(Boolean))
  };
}

export function matchesAuthor(
  email: string | null | undefined,
  username: string | null | undefined,
  filter: AuthorFilter
): boolean {
  const normalizedEmail = normalize(email);
  const normalizedUsername = normalize(username);

  if (filter.emails.size === 0 && filter.usernames.size === 0) {
    return true;
  }

  return filter.emails.has(normalizedEmail) || filter.usernames.has(normalizedUsername);
}

function trimPatch(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  const redacted = redactSecrets(input);
  if (redacted.length <= 1_500) {
    return redacted;
  }
  return `${redacted.slice(0, 1_500)}\n...[truncated]`;
}

type CommitListItem = Awaited<ReturnType<Octokit["repos"]["listCommits"]>>["data"][number];

async function listCommitsWithBranchFallback(
  octokit: Octokit,
  owner: string,
  repoName: string,
  defaultBranch: string,
  window: RunWindow
): Promise<CommitListItem[]> {
  const listWithBranch = () =>
    withRetry(() =>
      octokit.paginate(octokit.repos.listCommits, {
        owner,
        repo: repoName,
        sha: defaultBranch,
        since: window.startIso,
        until: window.endIso,
        per_page: 100
      })
    );

  try {
    return await listWithBranch();
  } catch (error) {
    const status = (error as { status?: number }).status;

    // 409 can mean empty repository; 422 can mean invalid `sha`.
    if (status === 409) {
      console.warn(`Skipping ${owner}/${repoName}: GitHub returned 409 for branch '${defaultBranch}'.`);
      return [];
    }

    if (status === 422) {
      const fallback = await withRetry(() =>
        octokit.paginate(octokit.repos.listCommits, {
          owner,
          repo: repoName,
          since: window.startIso,
          until: window.endIso,
          per_page: 100
        })
      );
      return fallback;
    }

    throw error;
  }
}

function isStrictlyInsideWindow(dateIso: string | null | undefined, window: RunWindow): boolean {
  if (!dateIso) {
    return false;
  }
  const value = Date.parse(dateIso);
  const start = Date.parse(window.startIso);
  const end = Date.parse(window.endIso);
  if (Number.isNaN(value) || Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return value > start && value <= end;
}

export async function collectRepoCommits(
  octokit: Octokit,
  repo: RepoTarget,
  window: RunWindow,
  authorFilter: AuthorFilter
): Promise<CommitRecord[]> {
  const { owner, repo: repoName } = splitFullName(repo.fullName);

  const commits = await listCommitsWithBranchFallback(octokit, owner, repoName, repo.defaultBranch, window);

  const relevant = commits.filter((commit) =>
    matchesAuthor(commit.commit.author?.email, commit.author?.login, authorFilter) &&
    isStrictlyInsideWindow(commit.commit.author?.date, window)
  );

  const output: CommitRecord[] = [];
  for (const commit of relevant) {
    const details = await withRetry(() =>
      octokit.repos.getCommit({
        owner,
        repo: repoName,
        ref: commit.sha
      })
    );

    output.push({
      sha: commit.sha,
      repo: repo.fullName,
      authorEmail: commit.commit.author?.email ?? "",
      authorLogin: commit.author?.login ?? "",
      date: commit.commit.author?.date ?? new Date().toISOString(),
      message: redactSecrets(commit.commit.message),
      url: commit.html_url,
      files:
        details.data.files?.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes,
          patch: trimPatch(file.patch)
        })) ?? []
    });
  }

  output.sort((a, b) => a.date.localeCompare(b.date));
  return output;
}
