# Code Change Agent

Nightly GitHub org scan for author-filtered changes, AI summarization, Notion documentation, and WhatsApp executive alerts.

## What it does

- Runs hourly in GitHub Actions, executes only at `00:00 Australia/Sydney`
- Discovers repositories in a GitHub org
- Filters commits by configured author emails/usernames
- Summarizes changes using OpenAI
- Writes a daily report to Notion
- Sends a WhatsApp executive summary with the Notion link
- Stores checkpoint state in `.state/checkpoints.json`
- Uses LangGraph to orchestrate each agent stage as explicit graph nodes

## LangGraph Workflow

The runtime is orchestrated in [`graph.ts`](src/agent/graph.ts) as:

1. `loadRuntime`: load env vars and run metadata
2. `timeGate`: enforce Sydney-midnight execution window
3. `setup`: load config, checkpoint, and run window
4. `collectChanges`: discover repos and fetch filtered commits
5. `summarize`: run per-repo + executive AI summarization
6. `publish`: write Notion entry and send WhatsApp summary
7. `checkpoint`: persist next checkpoint only on success

If `@langchain/langgraph` is not installed in the runtime environment, the app falls back to the same node sequence runner so production jobs keep working.

## Tools and Skills

Defined in [`catalog.ts`](src/agent/catalog.ts):

- Tools:
  - GitHub Octokit API
  - OpenAI Responses API
  - Notion API
  - WhatsApp Cloud API
  - Checkpoint JSON Store
- Skills:
  - Time Gate Skill
  - GitHub Scan Skill
  - Change Analysis Skill
  - Notion Publishing Skill
  - WhatsApp Notification Skill
  - Checkpoint Skill

## Setup

1. Copy and edit [`config/agent.config.yaml`](config/agent.config.yaml).
2. Configure GitHub Actions secrets:
   - `GH_ORG_TOKEN` (recommended fine-grained token with read access to scanned repos; fallback is workflow `github.token`)
   - `OPENAI_API_KEY`
   - `NOTION_TOKEN`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run locally:
   ```bash
   npm run start
   ```
   In `DRY_RUN=true`, Notion and WhatsApp tokens are optional.

## Environment flags

- `DRY_RUN=true`: generate summaries and log report JSON, skip Notion/WhatsApp writes and checkpoint update.
- `FORCE_RUN=true`: bypass Sydney midnight gate for local testing.

## Notion database schema

Create/share a database with these property names:

- `Date` (Date)
- `Window Start` (Text)
- `Window End` (Text)
- `Repo Count` (Number)
- `Commit Count` (Number)
- `Status` (Select, includes `Success`)
- `Run ID` (Text)
- `Top Repos` (Text)
- `Notion URL` (URL, optional)

## WhatsApp template variables

The template body should expect parameters in this order:

1. Local date (`yyyy-mm-dd`)
2. Commit count
3. Repo count
4. Top highlight
5. Notion report URL

## Rollout

- Phase 1: run with `DRY_RUN=true`
- Phase 2: enable Notion writes only (comment out WhatsApp call)
- Phase 3: enable WhatsApp delivery  
