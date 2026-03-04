import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import type { AgentConfig, RuntimeEnv } from "./types.js";

const QUOTE_CHARS = new Set(["\"", "'", "“", "”", "‘", "’"]);

const configSchema = z.object({
  github: z.object({
    org: z.string().min(1),
    includeRepos: z.array(z.string()).default([]),
    excludeRepos: z.array(z.string()).default([]),
    mainBranchDefault: z.string().min(1).default("main")
  }),
  authors: z.object({
    emails: z.array(z.string()).default([]),
    usernames: z.array(z.string()).default([])
  }),
  notion: z.object({
    databaseId: z.string().min(1)
  }),
  whatsapp: z.object({
    recipient: z.string().min(1),
    templateName: z.string().min(1),
    languageCode: z.string().min(1).default("en")
  }),
  openai: z.object({
    model: z.string().min(1).default("gpt-4.1-mini"),
    maxTokens: z.number().int().positive().default(1200)
  })
});

function normalizeConfig(data: AgentConfig): AgentConfig {
  const githubOrg = data.github.org.trim();
  if (/[^\x00-\x7F]/.test(githubOrg)) {
    throw new Error("Invalid github.org: contains non-ASCII characters (possibly smart quotes).");
  }

  const usernames = data.authors.usernames.map((value) => value.toLowerCase().trim());
  for (const username of usernames) {
    if (/[^\x00-\x7F]/.test(username)) {
      throw new Error("Invalid authors.usernames value: contains non-ASCII characters.");
    }
  }

  return {
    ...data,
    authors: {
      emails: data.authors.emails.map((value) => value.toLowerCase().trim()),
      usernames
    },
    github: {
      ...data.github,
      org: githubOrg,
      includeRepos: data.github.includeRepos.map((value) => value.trim()).filter(Boolean),
      excludeRepos: data.github.excludeRepos.map((value) => value.trim()).filter(Boolean)
    }
  };
}

export async function loadConfig(configPath = "config/agent.config.yaml"): Promise<AgentConfig> {
  const resolvedPath = path.resolve(configPath);
  const source = await fs.readFile(resolvedPath, "utf8");
  const parsed = yaml.load(source);
  const config = configSchema.parse(parsed);
  return normalizeConfig(config);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  let cleaned = value.trim();
  if (cleaned.length >= 2 && QUOTE_CHARS.has(cleaned[0]) && QUOTE_CHARS.has(cleaned[cleaned.length - 1])) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (/[^\x00-\x7F]/.test(cleaned)) {
    throw new Error(
      `Invalid ${name}: contains non-ASCII characters (likely smart quotes). Re-export it using plain ASCII quotes or no quotes.`
    );
  }
  return cleaned;
}

export function loadRuntimeEnv(): RuntimeEnv {
  const dryRun = process.env.DRY_RUN === "true";
  const notionToken = process.env.NOTION_TOKEN?.trim() ?? "";
  const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";

  if (!dryRun) {
    if (!notionToken) {
      throw new Error("Missing required environment variable: NOTION_TOKEN");
    }
    if (!whatsappAccessToken) {
      throw new Error("Missing required environment variable: WHATSAPP_ACCESS_TOKEN");
    }
    if (!whatsappPhoneNumberId) {
      throw new Error("Missing required environment variable: WHATSAPP_PHONE_NUMBER_ID");
    }
  }

  return {
    githubToken: requireEnv("GITHUB_TOKEN"),
    openaiApiKey: requireEnv("OPENAI_API_KEY"),
    notionToken,
    whatsappAccessToken,
    whatsappPhoneNumberId,
    dryRun,
    forceRun: process.env.FORCE_RUN === "true"
  };
}
