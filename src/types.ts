export interface RepoTarget {
  fullName: string;
  defaultBranch: string;
}

export interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface CommitRecord {
  sha: string;
  repo: string;
  authorEmail: string;
  authorLogin: string;
  date: string;
  message: string;
  url: string;
  files: CommitFile[];
}

export interface RunWindow {
  startIso: string;
  endIso: string;
}

export interface RepoReport {
  repo: string;
  commitCount: number;
  highlights: string[];
  risks: string[];
  detailedNotes: string;
}

export interface DailyReport {
  dateLocal: string;
  window: RunWindow;
  totals: {
    repoCount: number;
    commitCount: number;
  };
  repoReports: RepoReport[];
  executiveSummary: string[];
  notionUrl: string;
}

export interface CheckpointState {
  version: number;
  lastSuccessfulRunIso: string | null;
  perRepoLastSeenSha: Record<string, string>;
}

export interface AgentConfig {
  github: {
    org: string;
    includeRepos: string[];
    excludeRepos: string[];
    mainBranchDefault: string;
  };
  authors: {
    emails: string[];
    usernames: string[];
  };
  notion: {
    databaseId: string;
  };
  whatsapp: {
    recipient: string;
    templateName: string;
    languageCode: string;
  };
  openai: {
    model: string;
    maxTokens: number;
  };
}

export interface RuntimeEnv {
  githubToken: string;
  openaiApiKey: string;
  notionToken: string;
  whatsappAccessToken: string;
  whatsappPhoneNumberId: string;
  dryRun: boolean;
  forceRun: boolean;
}
