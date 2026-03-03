import type { CommitRecord } from "./types.js";

export function dedupeCommits(commits: CommitRecord[]): CommitRecord[] {
  const seen = new Set<string>();
  const output: CommitRecord[] = [];

  for (const commit of commits) {
    const key = `${commit.repo}:${commit.sha}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(commit);
  }

  output.sort((a, b) => a.date.localeCompare(b.date));
  return output;
}

export function topRepoNames(commitsByRepo: Record<string, CommitRecord[]>, limit = 5): string[] {
  return Object.entries(commitsByRepo)
    .map(([repo, commits]) => ({ repo, count: commits.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => item.repo);
}
