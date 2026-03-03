import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CheckpointState, CommitRecord, RunWindow } from "./types.js";

const checkpointSchema = z.object({
  version: z.number().int().positive(),
  lastSuccessfulRunIso: z.string().datetime().nullable(),
  perRepoLastSeenSha: z.record(z.string(), z.string())
});

const DEFAULT_CHECKPOINT: CheckpointState = {
  version: 1,
  lastSuccessfulRunIso: null,
  perRepoLastSeenSha: {}
};

export async function loadCheckpoint(filePath = ".state/checkpoints.json"): Promise<CheckpointState> {
  const resolved = path.resolve(filePath);
  try {
    const raw = await fs.readFile(resolved, "utf8");
    const parsed = JSON.parse(raw);
    return checkpointSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_CHECKPOINT;
    }
    throw error;
  }
}

export async function saveCheckpoint(
  checkpoint: CheckpointState,
  filePath = ".state/checkpoints.json"
): Promise<void> {
  const resolved = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

function newestCommitSha(commits: CommitRecord[]): string | null {
  if (commits.length === 0) {
    return null;
  }
  const newest = commits.reduce((latest, current) => {
    return current.date > latest.date ? current : latest;
  });
  return newest.sha;
}

export function buildNextCheckpoint(
  current: CheckpointState,
  window: RunWindow,
  commitsByRepo: Record<string, CommitRecord[]>
): CheckpointState {
  const next: CheckpointState = {
    version: current.version,
    lastSuccessfulRunIso: window.endIso,
    perRepoLastSeenSha: { ...current.perRepoLastSeenSha }
  };

  for (const [repo, commits] of Object.entries(commitsByRepo)) {
    const latest = newestCommitSha(commits);
    if (latest) {
      next.perRepoLastSeenSha[repo] = latest;
    }
  }

  return next;
}
