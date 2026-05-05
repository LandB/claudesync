# ClaudeSync

> Keep your Claude Code environment identical across every machine.

ClaudeSync syncs your `~/.claude` directory — CLAUDE.md, skills, plugins, settings — in real-time between all your devices. A thin local agent watches for changes and pushes them to Supabase. Other devices pull instantly via Realtime or catch up on reconnect.

## How it works

```
Device A                    Supabase                    Device B
~/.claude ──watch──► agent ──push──► storage + DB ──realtime──► agent ──► ~/.claude
                                           │
                                     change_queue
                                     sync_files
                                     conflict_log
```

- **Agent** — Node.js process, watches `~/.claude`, pushes changes via Edge Functions  
- **Edge Functions** — Deno, handle auth, sync, MCP protocol  
- **Dashboard** — React SPA on Netlify, manage devices, edit files, browse plugins  
- **MCP** — Claude Code connects directly via `claude mcp add`, exposes 7 tools  

## Stack

| Layer | Tech |
|---|---|
| Database | Supabase Postgres + RLS |
| Storage | Supabase Storage (private, per-user) |
| Realtime | Supabase Realtime broadcast |
| API | Supabase Edge Functions (Deno) |
| Dashboard | React + Vite → Netlify |
| Agent | Node.js, chokidar |

**Cost:** $0 on Supabase + Netlify free tiers during development. ~$25/mo Supabase Pro for production.

## Quick start (use hosted)

1. **Sign up** at your ClaudeSync dashboard URL
2. **Install agent** on each machine:
   ```bash
   curl -fsSL https://<project>.supabase.co/functions/v1/install-script | bash
   ```
3. **Add MCP to Claude Code:**
   ```bash
   claude mcp add --transport http claudesync \
     https://<project>.supabase.co/functions/v1/mcp \
     --header 'Authorization: Bearer YOUR_TOKEN'
   ```

Your token is shown in the dashboard under **Token & Install**.

## Self-host

### Prerequisites
- [Supabase account](https://supabase.com) (free tier works)
- [Netlify account](https://netlify.com) (free tier works)
- [Supabase CLI](https://supabase.com/docs/guides/cli) — `brew install supabase/tap/supabase`
- Node.js 18+

### 1. Clone and link

```bash
git clone https://github.com/LandB/claudesync
cd claudesync
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Run migrations

```bash
supabase db push
```

This creates all tables, RLS policies, storage bucket, Realtime publications, and cron jobs.

### 3. Deploy Edge Functions

```bash
for fn in heartbeat sync-push sync-pull bundle install-script mcp refresh-plugins; do
  supabase functions deploy $fn --no-verify-jwt
done
```

### 4. Deploy dashboard

```bash
# Set env vars in Netlify UI or CLI:
# VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key

netlify deploy --prod --dir=dashboard/dist
# or connect GitHub repo to Netlify for auto-deploy
```

### 5. Install agent

Get your token from the dashboard, then:

```bash
curl -fsSL https://YOUR_PROJECT.supabase.co/functions/v1/install-script | bash
```

## MCP tools

| Tool | Description |
|---|---|
| `sync_push` | Push a file to all devices |
| `sync_pull` | Pull pending changes for this device |
| `device_status` | List devices with online/offline status |
| `list_skills` | Browse the community plugin registry |
| `install_skill` | Install a skill from the registry |
| `install_plugin` | Install an MCP plugin from the registry |
| `diff` | Compare local file against remote version |

## Project structure

```
claudesync/
├── agent/                  # Node.js local agent
│   ├── index.js            # Entry point
│   └── lib/
│       ├── api.js           # Edge Function calls
│       ├── applier.js       # Apply incoming changes
│       ├── config.js        # Config loader
│       └── watcher.js       # fs.watch + debounce
├── dashboard/              # React + Vite SPA
│   └── src/
│       └── components/
│           ├── AuthScreen.jsx
│           ├── ConflictLog.jsx
│           ├── Devices.jsx
│           ├── FileEditor.jsx
│           ├── PluginManager.jsx
│           ├── SyncPanel.jsx
│           └── TokenPanel.jsx
├── supabase/
│   ├── functions/          # Deno Edge Functions
│   │   ├── _shared/auth.ts
│   │   ├── heartbeat/
│   │   ├── sync-push/
│   │   ├── sync-pull/
│   │   ├── bundle/
│   │   ├── install-script/
│   │   ├── mcp/
│   │   └── refresh-plugins/
│   └── migrations/         # 11 ordered SQL migrations
└── netlify.toml
```

## Database schema

| Table | Purpose |
|---|---|
| `profiles` | One row per user, stores agent bearer token |
| `devices` | Registered machines, heartbeat timestamp |
| `sync_files` | File metadata index (path, hash, storage_path) |
| `change_queue` | Per-device delivery queue for file changes |
| `conflict_log` | Records when two devices write the same file concurrently |
| `plugin_registry` | Community skill/plugin catalog (162+ entries) |

All tables have Row Level Security — users only access their own rows.

## Agent auto-start

| Platform | Method |
|---|---|
| macOS | launchd (`~/Library/LaunchAgents/com.claudesync.agent.plist`) |
| Linux | systemd user service (`~/.config/systemd/user/claudesync.service`) |
| Windows | Task Scheduler (via `schtasks.exe`) |

## Contributing

1. Fork + clone
2. `supabase start` (requires Docker) or link to your own Supabase project
3. `cd dashboard && npm install && npm run dev`
4. `cd agent && node index.js` (with `CLAUDESYNC_CONFIG` pointing to your config)

PRs welcome. Please open an issue first for large changes.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
