import type { Octokit } from "@octokit/rest";
import type { AgentConfig, RepoTarget } from "../types.js";
import { withRetry } from "../utils/retry.js";

interface GitHubRepoSummary {
  archived?: boolean;
  disabled?: boolean;
  full_name: string;
  default_branch?: string | null;
}

function normalizeRepoName(fullName: string): string {
  return fullName.toLowerCase().trim();
}

function shouldIncludeRepo(
  fullName: string,
  includeSet: Set<string>,
  excludeSet: Set<string>
): boolean {
  const normalized = normalizeRepoName(fullName);
  const short = normalized.split("/")[1] ?? normalized;

  if (excludeSet.has(normalized) || excludeSet.has(short)) {
    return false;
  }

  if (includeSet.size === 0) {
    return true;
  }

  return includeSet.has(normalized) || includeSet.has(short);
}

export async function discoverRepositories(
  octokit: Octokit,
  config: AgentConfig["github"]
): Promise<RepoTarget[]> {
  const includeSet = new Set(config.includeRepos.map((repo) => normalizeRepoName(repo)));
  const excludeSet = new Set(config.excludeRepos.map((repo) => normalizeRepoName(repo)));

  let repos: GitHubRepoSummary[];

  try {
    repos = await withRetry(() =>
      octokit.paginate(octokit.repos.listForOrg, {
        org: config.org,
        type: "all",
        per_page: 100,
        sort: "full_name",
        direction: "asc"
      })
    );
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 404) {
      throw error;
    }

    // If `github.org` is actually a personal username, org endpoint returns 404.
    repos = await withRetry(() =>
      octokit.paginate(octokit.repos.listForUser, {
        username: config.org,
        type: "owner",
        per_page: 100,
        sort: "full_name",
        direction: "asc"
      })
    );
  }

  return repos
    .filter((repo) => !repo.archived && !repo.disabled)
    .map((repo) => ({
      fullName: repo.full_name,
      defaultBranch: repo.default_branch || config.mainBranchDefault
    }))
    .filter((repo) => shouldIncludeRepo(repo.fullName, includeSet, excludeSet));
}
