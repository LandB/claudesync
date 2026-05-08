#!/usr/bin/env node
process.title = 'claudesync-agent'
import { hostname, platform, networkInterfaces } from 'os'
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join, relative, dirname } from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadConfig } from './lib/config.js'
import { ApiClient, sha256 } from './lib/api.js'
import { isAllowed, CHOKIDAR_IGNORE } from './lib/watcher.js'
import { sanitizePluginPaths, sanitizeHomePath, expandPluginPaths, expandHomePath } from './lib/sanitize-plugin-paths.js'

const HEARTBEAT_INTERVAL_MS = 30_000

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

function collectLocalFiles(claudePath) {
  const results = []
  function walk(dir) {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (CHOKIDAR_IGNORE.some(re => re.test(full))) continue
        walk(full)
      } else {
        const rel = relative(claudePath, full)
        if (!isAllowed(rel)) continue
        try {
          const content = readFileSync(full)
          results.push({ path: rel, hash: sha256(content) })
        } catch { /* skip unreadable */ }
      }
    }
  }
  walk(claudePath)
  return results
}

async function main() {
  const configPath = process.env.CLAUDESYNC_CONFIG
  const config = loadConfig(configPath)
  const { supabaseUrl, agentToken, claudePath } = config

  const api = new ApiClient({ supabaseUrl, agentToken })

  console.log('[startup] registering device...')
  const { device_id: deviceId } = await api.heartbeat({
    hostname: hostname(),
    platform: platform(),
    claudePath,
    name: config.name ?? hostname(),
    macAddress: getMacAddress(),
  })
  console.log(`[startup] device_id: ${deviceId}`)

  const supabase = createClient(supabaseUrl, config.supabaseAnonKey ?? 'anon-placeholder', {
    realtime: { params: { eventsPerSecond: 10 } },
  })

  supabase
    .channel(`device:${deviceId}`)
    .on('broadcast', { event: 'discover' }, async () => {
      console.log('[discover] running...')
      try {
        const localFiles = collectLocalFiles(claudePath)
        const { diffs } = await api.discover(deviceId, localFiles)
        console.log(`[discover] ${diffs} file(s) differ from server`)
      } catch (err) {
        console.error('[discover error]', err.message)
      }
    })
    .on('broadcast', { event: 'sync' }, async ({ payload }) => {
      const files = payload?.files ?? []
      console.log(`[sync] syncing ${files.length} file(s)...`)
      for (const filePath of files) {
        const absPath = join(claudePath, filePath)
        try {
          let raw
          try { raw = readFileSync(absPath) } catch { continue }
          const content = sanitizeHomePath(sanitizePluginPaths(filePath, raw, claudePath), claudePath)
          const hash = sha256(content)
          await api.push({ deviceId, filePath, content, hash, operation: 'upsert' })
          console.log(`[sync] pushed ${filePath}`)
        } catch (err) {
          console.error(`[sync] error pushing ${filePath}:`, err.message)
        }
      }
      try {
        await api.syncComplete(deviceId)
        console.log('[sync] complete')
      } catch (err) {
        console.error('[sync] syncComplete error:', err.message)
      }
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
            const absPath = join(claudePath, f.path)
            mkdirSync(dirname(absPath), { recursive: true })
            writeFileSync(absPath, content)
            console.log(`[snapshot] ${f.path}`)
            pulled++
          } catch (err) {
            console.error(`[snapshot] error ${f.path}:`, err.message)
          }
        }
        console.log(`[snapshot] done — ${pulled} pulled`)
      } catch (err) {
        console.error('[snapshot error]', err.message)
      }
    })
    .on('broadcast', { event: 'restart' }, () => {
      console.log('[restart] restart requested from dashboard — exiting')
      process.exit(0)
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
      })
    } catch (err) { console.error('[heartbeat error]', err.message) }
  }, HEARTBEAT_INTERVAL_MS)

  console.log('[ready] ClaudeSync agent running (manual sync mode)')
}

main().catch(err => {
  console.error('[fatal]', err)
  process.exit(1)
})
