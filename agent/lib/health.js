import { spawnSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { homedir, platform } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.claudesync')
export const STATUS_PATH = join(CONFIG_DIR, 'agent-status.json')

/**
 * Failures no restart can clear: the server has rejected this machine or its
 * token, so every attempt repeats the same response. Left to the supervisor,
 * they turn into a silent crash loop — the agent looks installed and is simply
 * never there.
 */
const PERMANENT_HTTP = new Set([401, 403])

const HINTS = {
  401: 'Agent token rejected. Re-run the install script from the dashboard to refresh ~/.claudesync/config.json.',
  403: 'This device is blocked — it was removed from the dashboard, and removal blocks the machine from re-registering. Unblock it under Devices → Blocked devices, then start the agent again.',
}

export function isPermanent(err) {
  return PERMANENT_HTTP.has(err?.status)
}

export function hintFor(err) {
  return HINTS[err?.status] ?? null
}

export function writeStatus(status) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(STATUS_PATH, `${JSON.stringify({ ...status, at: new Date().toISOString() }, null, 2)}\n`)
  } catch {
    // The status file is a convenience for the user and any tooling reading it;
    // never let it take the agent down.
  }
}

/**
 * Best-effort desktop notification.
 *
 * Runs synchronously: callers fire this immediately before process.exit, and a
 * detached notifier would be killed before it ever drew anything.
 */
export function notify(title, message) {
  try {
    if (platform() === 'darwin') {
      const esc = (v) => v.replace(/[\\"]/g, '\\$&')
      run('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}"`], 5000)
    } else if (platform() === 'win32') {
      const esc = (v) => v.replace(/'/g, "''")
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
        '$n = New-Object System.Windows.Forms.NotifyIcon;',
        '$n.Icon = [System.Drawing.SystemIcons]::Warning;',
        '$n.Visible = $true;',
        `$n.ShowBalloonTip(10000, '${esc(title)}', '${esc(message)}', [System.Windows.Forms.ToolTipIcon]::Warning);`,
        'Start-Sleep -Seconds 6;',
        '$n.Dispose()',
      ].join(' ')
      run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 15000)
    } else {
      run('notify-send', ['-u', 'critical', title, message], 5000)
    }
  } catch {
    // Headless box, no notification daemon, osascript missing — the log line and
    // the status file are still there.
  }
}

function run(cmd, args, timeout) {
  spawnSync(cmd, args, { stdio: 'ignore', timeout })
}
