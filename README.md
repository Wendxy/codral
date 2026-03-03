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
