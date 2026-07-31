#!/usr/bin/env node
process.title = 'claudesync-agent'
import { hostname, platform, networkInterfaces } from 'os'
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, statSync, realpathSync } from 'fs'
import { join, relative, dirname } from 'path'
import { execSync, spawn } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { loadConfig } from './lib/config.js'
import { ApiClient, sha256 } from './lib/api.js'
import { getDeviceUuid } from './lib/device-id.js'
import { isAllowed, CHOKIDAR_IGNORE } from './lib/watcher.js'
import { sanitizePluginPaths, sanitizeHomePath, expandPluginPaths, expandHomePath } from './lib/sanitize-plugin-paths.js'
import { isPermanent, hintFor, notify, writeStatus, STATUS_PATH } from './lib/health.js'

const HEARTBEAT_INTERVAL_MS = 30_000

// Restarts requested from the dashboard exit non-zero on purpose: the supervisor
// is configured to restart on failure only, so a clean exit would take the agent
// down for good instead of bouncing it.
const EXIT_RESTART = 75

/**
 * Single exit path for anything that stops the agent. Leaves three traces the
 * user can actually find: the log line, the status file, and a desktop
 * notification — a crashed background agent is otherwise indistinguishable from
 * a running one.
 */
function fatal(err) {
  const permanent = isPermanent(err)
  const hint = hintFor(err)
  const message = err?.message ?? String(err)

  console.error('[fatal]', err)
  if (hint) console.error('[fatal]', hint)

  writeStatus({
    state: 'stopped',
    error: message,
    http_status: err?.status ?? null,
    permanent,
    hint,
  })
  notify('ClaudeSync agent stopped', hint ?? message)

  // Exiting 0 on a permanent failure is what stops launchd/systemd from
  // restarting straight back into the same rejection.
  process.exit(permanent ? 0 : 1)
}

function getMacAddress() {
  const nets = networkInterfaces()
  const sorted = Object.keys(nets).sort((a, b) => {
    const aPhys = /^(en|eth)\d/.test(a)
    const bPhys = /^(en|eth)\d/.test(b)
    if (aPhys !== bPhys) return aPhys ? -1 : 1
    return a.localeCompare(b)
  })
  for (const name of sorted) {
    for (const net of nets[name]) {
      if (!net.internal && net.family === 'IPv4' && net.mac && net.mac !== '00:00:00:00:00:00') {
        return net.mac
      }
    }
  }
  return null
}

function findClaudeBin() {
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude'
    return execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim().split('\n')[0].trim()
  } catch {
    return null
  }
}

function collectLocalFiles(claudePath, agentsPath) {
  const results = []
  const visitedReal = new Set()

  function walk(dir, rootPath, prefix) {
    let realDir
    try { realDir = realpathSync(dir) } catch { return }
    if (visitedReal.has(realDir)) return
    visitedReal.add(realDir)

    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      let isDir = entry.isDirectory()
      let isFile = entry.isFile()
      if (entry.isSymbolicLink()) {
        try { const st = statSync(full); isDir = st.isDirectory(); isFile = st.isFile() }
        catch { continue }
      }
      if (isDir) {
        if (CHOKIDAR_IGNORE.some(re => re.test(full))) continue
        walk(full, rootPath, prefix)
      } else if (isFile) {
        const rel = prefix + relative(rootPath, full)
        if (!isAllowed(rel)) continue
        try {
          const raw = readFileSync(full)
          const content = sanitizeHomePath(sanitizePluginPaths(rel, raw, claudePath), claudePath)
          results.push({ path: rel, hash: sha256(content) })
        } catch { /* skip unreadable */ }
      }
    }
  }

  walk(claudePath, claudePath, '')
  if (existsSync(agentsPath)) walk(agentsPath, agentsPath, 'agents/')
  return results
}

async function installMissingPlugins(claudePath, claudeBin) {
  if (!claudeBin) {
    console.warn('[plugins] claude binary not found — skipping plugin install')
    return
  }

  const registryPath = join(claudePath, 'plugins', 'installed_plugins.json')
  if (!existsSync(registryPath)) return

  let registry
  try {
    registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  } catch {
    console.warn('[plugins] failed to parse installed_plugins.json')
    return
  }

  const plugins = registry?.plugins ?? {}
  const entries = Object.entries(plugins)
  if (!entries.length) return

  console.log(`[plugins] checking ${entries.length} plugin(s)...`)

  for (const [key, installs] of entries) {
    const install = Array.isArray(installs) ? installs[0] : installs
    if (!install) continue

    // Check if cache dir exists — if so, already installed
    if (install.installPath && existsSync(install.installPath)) continue

    // key is "namespace@name" → install "namespace/name"
    const pluginId = key.replace('@', '/')
    console.log(`[plugins] installing ${pluginId}...`)

    await new Promise((resolve) => {
      const proc = spawn(claudeBin, ['plugin', 'install', pluginId], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })
      proc.stdout.on('data', d => process.stdout.write(`[plugins] ${d}`))
      proc.stderr.on('data', d => process.stderr.write(`[plugins] ${d}`))
      proc.on('close', (code) => {
        if (code !== 0) console.error(`[plugins] install failed for ${pluginId} (exit ${code})`)
        else console.log(`[plugins] installed ${pluginId}`)
        resolve()
      })
      proc.on('error', (err) => {
        console.error(`[plugins] spawn error for ${pluginId}: ${err.message}`)
        resolve()
      })
    })
  }
}

async function main() {
  const configPath = process.env.CLAUDESYNC_CONFIG
  const config = loadConfig(configPath)
  const { supabaseUrl, agentToken, claudePath } = config
  const agentsPath = join(dirname(claudePath), '.agents')

  const claudeBin = findClaudeBin()
  if (claudeBin) console.log(`[startup] claude bin: ${claudeBin}`)
  else console.warn('[startup] claude binary not found — plugin auto-install disabled')

  const api = new ApiClient({ supabaseUrl, agentToken })

  const deviceUuid = getDeviceUuid()

  console.log('[startup] registering device...')
  const { device_id: deviceId } = await api.heartbeat({
    hostname: hostname(),
    platform: platform(),
    claudePath,
    name: config.name ?? hostname(),
    macAddress: getMacAddress(),
    deviceUuid,
  })
  console.log(`[startup] device_id: ${deviceId}`)
  writeStatus({ state: 'running', device_id: deviceId, hostname: hostname(), pid: process.pid })

  const supabase = createClient(supabaseUrl, config.supabaseAnonKey ?? 'anon-placeholder', {
    realtime: { params: { eventsPerSecond: 10 } },
  })

  supabase
    .channel(`device:${deviceId}`)
    .on('broadcast', { event: 'discover' }, async () => {
      console.log('[discover] running...')
      try {
        const localFiles = collectLocalFiles(claudePath, agentsPath)
        const { diffs } = await api.discover(deviceId, localFiles)
        console.log(`[discover] ${diffs} file(s) differ from server`)
      } catch (err) {
        console.error('[discover error]', err.message)
      }
    })
    .on('broadcast', { event: 'sync' }, async ({ payload }) => {
      const files = payload?.files ?? []
      console.log(`[sync] syncing ${files.length} file(s)...`)
      const synced = []
      const failed = []
      for (const filePath of files) {
        const absPath = filePath.startsWith('agents/') ? join(agentsPath, filePath.slice('agents/'.length)) : join(claudePath, filePath)
        try {
          let raw
          try { raw = readFileSync(absPath) }
          catch (err) { failed.push({ path: filePath, error: `unreadable locally: ${err.message}` }); continue }
          const content = sanitizeHomePath(sanitizePluginPaths(filePath, raw, claudePath), claudePath)
          const hash = sha256(content)
          await api.push({ deviceId, filePath, content, hash, operation: 'upsert' })
          synced.push(filePath)
          console.log(`[sync] pushed ${filePath}`)
        } catch (err) {
          failed.push({ path: filePath, error: err.message })
          console.error(`[sync] error pushing ${filePath}:`, err.message)
        }
      }
      try {
        await api.syncComplete(deviceId, synced, failed)
        console.log(`[sync] complete — ${synced.length} pushed, ${failed.length} failed`)
      } catch (err) {
        console.error('[sync] syncComplete error:', err.message)
      }
      if (failed.length) {
        for (const f of failed) console.error(`[sync] FAILED ${f.path}: ${f.error}`)
        notify('ClaudeSync: sync incomplete', `${failed.length} file(s) failed to push — still pending in the dashboard.`)
      }
      writeStatus({
        state: 'running',
        device_id: deviceId,
        hostname: hostname(),
        pid: process.pid,
        last_sync: { at: new Date().toISOString(), pushed: synced.length, failed },
      })
    })
    .on('broadcast', { event: 'snapshot' }, async () => {
      console.log('[snapshot] pulling from server...')
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-snapshot`, {
          headers: { 'Authorization': `Bearer ${agentToken}` },
        })
        if (!res.ok) throw new Error(`sync-snapshot failed: ${res.status}`)
        const { files } = await res.json()
        console.log(`[snapshot] ${files.length} file(s) on server`)
        let pulled = 0
        for (const f of files) {
          if (!f.download_url) continue
          try {
            const dlRes = await fetch(f.download_url)
            if (!dlRes.ok) { console.error(`[snapshot] download failed: ${f.path}`); continue }
            const raw = Buffer.from(await dlRes.arrayBuffer())
            const content = expandHomePath(expandPluginPaths(f.path, raw, claudePath), claudePath)
            const absPath = f.path.startsWith('agents/') ? join(agentsPath, f.path.slice('agents/'.length)) : join(claudePath, f.path)
            mkdirSync(dirname(absPath), { recursive: true })
            writeFileSync(absPath, content)
            console.log(`[snapshot] ${f.path}`)
            pulled++
          } catch (err) {
            console.error(`[snapshot] error ${f.path}:`, err.message)
          }
        }
        console.log(`[snapshot] done — ${pulled} pulled`)
        await installMissingPlugins(claudePath, claudeBin)
      } catch (err) {
        console.error('[snapshot error]', err.message)
      }
    })
    .on('broadcast', { event: 'pull-files' }, async ({ payload }) => {
      const targetPaths = new Set(payload?.files ?? [])
      if (!targetPaths.size) return
      console.log(`[pull-files] ${targetPaths.size} file(s)...`)
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/sync-snapshot`, {
          headers: { 'Authorization': `Bearer ${agentToken}` },
        })
        if (!res.ok) throw new Error(`sync-snapshot failed: ${res.status}`)
        const { files } = await res.json()
        let pulledInstalledPlugins = false
        for (const f of files.filter(f => targetPaths.has(f.path))) {
          if (!f.download_url) continue
          try {
            const dlRes = await fetch(f.download_url)
            if (!dlRes.ok) { console.error(`[pull-files] download failed: ${f.path}`); continue }
            const raw = Buffer.from(await dlRes.arrayBuffer())
            const content = expandHomePath(expandPluginPaths(f.path, raw, claudePath), claudePath)
            const absPath = f.path.startsWith('agents/') ? join(agentsPath, f.path.slice('agents/'.length)) : join(claudePath, f.path)
            mkdirSync(dirname(absPath), { recursive: true })
            writeFileSync(absPath, content)
            console.log(`[pull-files] ${f.path}`)
            if (f.path === 'plugins/installed_plugins.json') pulledInstalledPlugins = true
          } catch (err) {
            console.error(`[pull-files] error ${f.path}:`, err.message)
          }
        }
        console.log('[pull-files] done')
        if (pulledInstalledPlugins) await installMissingPlugins(claudePath, claudeBin)
      } catch (err) {
        console.error('[pull-files error]', err.message)
      }
    })
    .on('broadcast', { event: 'install-plugin' }, async ({ payload }) => {
      const { plugin_id } = payload ?? {}
      if (!plugin_id) { console.warn('[install-plugin] missing plugin_id'); return }
      if (!claudeBin) { console.warn('[install-plugin] claude binary not found — cannot install'); return }
      console.log(`[install-plugin] installing ${plugin_id}...`)
      await new Promise((resolve) => {
        const proc = spawn(claudeBin, ['plugin', 'install', plugin_id], {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        })
        proc.stdout.on('data', d => process.stdout.write(`[install-plugin] ${d}`))
        proc.stderr.on('data', d => process.stderr.write(`[install-plugin] ${d}`))
        proc.on('close', (code) => {
          if (code !== 0) console.error(`[install-plugin] failed for ${plugin_id} (exit ${code})`)
          else console.log(`[install-plugin] installed ${plugin_id}`)
          resolve()
        })
        proc.on('error', (err) => {
          console.error(`[install-plugin] spawn error: ${err.message}`)
          resolve()
        })
      })
    })
    .on('broadcast', { event: 'restart' }, () => {
      console.log('[restart] restart requested from dashboard — exiting')
      process.exit(EXIT_RESTART)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('[realtime] connected')
      if (status === 'CHANNEL_ERROR') console.warn('[realtime] channel error')
    })

  setInterval(async () => {
    try {
      await api.heartbeat({
        hostname: hostname(),
        platform: platform(),
        claudePath,
        name: config.name ?? hostname(),
        macAddress: getMacAddress(),
        deviceUuid,
      })
    } catch (err) {
      // A device blocked while the agent was already up keeps heartbeating into
      // a 403 forever, staying "online" locally and dead everywhere else.
      if (isPermanent(err)) fatal(err)
      console.error('[heartbeat error]', err.message)
    }
  }, HEARTBEAT_INTERVAL_MS)

  console.log('[ready] ClaudeSync agent running (manual sync mode)')
  console.log(`[ready] status file: ${STATUS_PATH}`)
}

main().catch(fatal)
