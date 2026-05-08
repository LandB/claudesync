# ClaudeSync

> Keep your Claude Code environment identical across every machine.

ClaudeSync syncs your `~/.claude` directory — CLAUDE.md, skills, plugins, settings — across all your devices. A lightweight agent on each machine connects via Supabase Realtime and waits for commands from the dashboard. Sync is fully manual: you decide what to push and when to pull.

## How it works

```
Dashboard                   Supabase                    Agent (each device)
  │                            │                              │
  ├─ Discover Files ──────────►│────── broadcast ────────────►│── scan ~/.claude
  │                            │◄── POST sync-discover ───────│
  │◄── discovery_results ──────│                              │
  │                            │                              │
  ├─ Sync N files ────────────►│────── broadcast ────────────►│── read files
  │                            │◄── POST sync-push (each) ────│
  │                            │◄── POST sync-complete ────────│
  │                            │                              │
  ├─ Send files to machine ───►│────── broadcast ────────────►│── write ~/.claude
  │                            │◄── GET sync-snapshot ─────────│── install plugins
```

1. **Discover** — agent scans `~/.claude`, posts file hashes; server diffs against stored versions, writes results to `discovery_results`
2. **Sync to server** — dashboard shows pending files as a tree with checkboxes; agent reads selected files and pushes them
3. **Send to machine** — agent pulls all server files to `~/.claude`, then auto-installs any missing plugins via `claude plugin install`

## Stack

| Layer | Tech |
|---|---|
| Database | Supabase Postgres + RLS |
| Storage | Supabase Storage (private, per-user) |
| Realtime | Supabase Realtime broadcast |
| Edge Functions | Deno (Supabase) |
| Dashboard | React + Vite → Netlify |
| Agent | Node.js (no file watcher — event-driven) |

## Quick start

1. **Sign up** at your ClaudeSync dashboard URL
2. Go to **Token & Install**, copy the install command for your platform
3. Run it on each machine — the agent installs itself and auto-starts

**macOS / Linux:**
```bash
curl -fsSL https://<project>.supabase.co/functions/v1/install-script?token=YOUR_TOKEN | bash
```

**Windows (PowerShell, run as Administrator):**
```powershell
$tmp="$env:TEMP\cs-install.ps1"
irm "https://<project>.supabase.co/functions/v1/install-script?token=YOUR_TOKEN&platform=win" -OutFile $tmp
& $tmp
```

**Add MCP to Claude Code:**
```bash
claude mcp add --transport http claudesync \
  https://<project>.supabase.co/functions/v1/mcp \
  --header 'Authorization: Bearer YOUR_TOKEN' \
  --scope user
```

Your token is shown in the dashboard under **Token & Install**.

## Dashboard

| Page | What it does |
|---|---|
| **Overview** | File count, device count, conflict count, recent activity tree |
| **Devices** | Per-device discover / sync / snapshot / restart controls |
| **Files** | Browse and edit synced files in-browser |
| **Plugins & Skills** | Browse registry (162+ entries), install to a device, view installed |
| **Conflicts** | Review and resolve files written concurrently on two devices |
| **Token & Install** | Token management, install commands for all platforms |

### Device workflow

Each device card has three actions:

- **Discover files** — compares local `~/.claude` against server, shows a file tree of differences with new/modified badges. Select files with checkboxes, then **Sync to server**.
- **Send files to this machine** — pushes all server files down to the device and installs missing plugins.
- **Restart agent** — sends a restart signal; launchd/systemd restarts the process automatically.

## Path portability

Paths containing your home directory or claude path are tokenized on push (`{{USER_HOME}}`, `{{CLAUDE_PATH}}`) and expanded back on pull. Files sync cleanly between machines with different usernames or install locations.

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

### 3. Deploy Edge Functions

```bash
for fn in heartbeat sync-push sync-discover sync-complete sync-snapshot sync-trigger sync-pull bundle device-restart install-script mcp refresh-plugins; do
  supabase functions deploy $fn
done
```

### 4. Deploy dashboard

Set env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), then:

```bash
cd dashboard && npm install && npm run build
netlify deploy --prod --dir=dist
# or connect GitHub repo to Netlify for auto-deploy
```

### 5. Install agent

Get your token from the dashboard, then run the install command for your platform.

## Agent auto-start

| Platform | Method |
|---|---|
| macOS | launchd (`~/Library/LaunchAgents/com.claudesync.agent.plist`) |
| Linux | systemd user service (`~/.config/systemd/user/claudesync.service`) |
| Windows | Task Scheduler + VBScript launcher (hidden window, restarts on failure) |
| No systemd | Shell rc file (`~/.bashrc` / `~/.zshrc`) + nohup |

## Database schema

| Table | Purpose |
|---|---|
| `profiles` | One row per user, stores agent bearer token |
| `devices` | Registered machines, heartbeat timestamp, MAC address |
| `sync_files` | File metadata index (path, hash, storage_path) |
| `discovery_results` | Diff store — pending files per device after a discover run |
| `conflict_log` | Records when two devices write the same file concurrently |
| `plugin_registry` | Community skill/plugin catalog |
| `device_blocklist` | Prevents removed devices from re-registering |

All tables have Row Level Security — users only access their own rows.

## Edge Functions

| Function | Auth | Purpose |
|---|---|---|
| `heartbeat` | Agent token | Device registration + keepalive |
| `sync-push` | Agent token | Push one file to storage + DB |
| `sync-discover` | Agent token | Receive file list, write diffs to `discovery_results` |
| `sync-complete` | Agent token | Clear `discovery_results` after sync |
| `sync-snapshot` | Agent token | Return download URLs for all server files |
| `sync-trigger` | Supabase JWT | Dashboard → broadcast discover/sync/snapshot to device |
| `device-restart` | Supabase JWT | Dashboard → broadcast restart to device |
| `install-script` | User token | Generate `install.sh` or `install.ps1` |
| `mcp` | Agent token | Claude Code MCP server |
| `refresh-plugins` | Supabase JWT | Refresh plugin registry from npm + awesome-mcp |

## Project structure

```
claudesync/
├── agent/
│   ├── index.js                    # Entry — Realtime listener, event handlers
│   └── lib/
│       ├── api.js                  # Edge Function client
│       ├── config.js               # Config loader
│       ├── watcher.js              # Allow/ignore rules (shared with discovery)
│       └── sanitize-plugin-paths.js # Path tokenization
├── dashboard/
│   └── src/
│       └── components/
│           ├── AuthScreen.jsx
│           ├── ConflictLog.jsx
│           ├── Devices.jsx         # Device cards, discover/sync/snapshot
│           ├── FileEditor.jsx
│           ├── PluginManager.jsx
│           ├── SyncPanel.jsx       # Overview + recent activity
│           └── TokenPanel.jsx
├── supabase/
│   ├── functions/                  # Deno Edge Functions (one dir per function)
│   └── migrations/                 # Ordered SQL migrations
└── netlify.toml
```

## Contributing

1. Fork + clone
2. `supabase start` (requires Docker) or link to your own project
3. `cd dashboard && npm install && npm run dev`
4. `CLAUDESYNC_CONFIG=~/.claudesync/config.json node agent/index.js`

PRs welcome. Open an issue first for large changes.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
