# Contributing to ClaudeSync

## Before you start

Open an issue before starting work on a large feature or refactor. Small bug fixes and documentation improvements can go straight to a PR.

## Development setup

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- Docker (for `supabase start`)

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_FORK/claudesync
cd claudesync
```

### 2. Supabase (local or linked)

**Local (Docker):**
```bash
supabase start
supabase db push
```

**Linked to a remote project:**
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### 3. Dashboard

```bash
cp dashboard/.env.example dashboard/.env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
cd dashboard && npm install && npm run dev
```

### 4. Agent

```bash
# edit ~/.claudesync/config.json with your local Supabase URL + token
CLAUDESYNC_CONFIG=~/.claudesync/config.json node agent/index.js
```

### 5. Edge Functions (optional)

```bash
supabase functions serve heartbeat sync-push sync-discover sync-complete sync-snapshot
```

## Project structure

```
agent/          Node.js local agent
dashboard/      React + Vite SPA
supabase/
  functions/    Deno edge functions
  migrations/   SQL migrations (ordered)
```

## Guidelines

- **Edge functions**: keep `verify_jwt = false` for agent-facing functions (they use UUID bearer tokens, not Supabase JWTs). Dashboard-facing functions use `verify_jwt = true`.
- **Dashboard**: inline styles only (no CSS files). Use `react-icons/lu` for all icons.
- **Agent**: no file watcher. All operations are triggered via Supabase Realtime broadcast events from the dashboard.
- **Migrations**: add a new numbered file in `supabase/migrations/`. Never edit existing migrations.
- **Secrets**: never commit `.env`, config files, or keys. The `.gitignore` covers the common cases.

## Submitting a PR

1. Branch from `main`
2. Keep the diff focused — one thing per PR
3. Test manually against a real Supabase instance (local or remote)
4. Fill in the PR template
