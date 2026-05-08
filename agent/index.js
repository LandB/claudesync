#!/usr/bin/env node
process.title = 'claudesync-agent'
import { hostname, platform, networkInterfaces } from 'os'
import { createClient } from '@supabase/supabase-js'
import chokidar from 'chokidar'
import { loadConfig } from './lib/config.js'
import { ApiClient } from './lib/api.js'
import { applyChange } from './lib/applier.js'
import { startWatcher } from './lib/watcher.js'
import { loadHashCache, saveHashCache } from './lib/hash-cache.js'

const POLL_INTERVAL_MS = 30_000

function getMacAddress() {
  const nets = networkInterfaces()
  // Sort so physical interfaces (en*, eth*) come before virtual/tunnel ones.
  // Within each group sort alphabetically so en0 always beats en1, etc.
  // This makes the result deterministic regardless of OS iteration order or
  // whether VPN/Docker interfaces are present.
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

async function pullAndApply({ api, deviceId, claudePath, hashCache }) {
  try {
    const { items } = await api.pull(deviceId)
    for (const item of items) {
      await applyChange(item, claudePath, hashCache)
    }
  } catch (err) {
    console.error('[pull error]', err.message)
  }
}

async function main() {
  const configPath = process.env.CLAUDESYNC_CONFIG
  const config = loadConfig(configPath)
  const { supabaseUrl, agentToken, claudePath } = config

  const api = new ApiClient({ supabaseUrl, agentToken })

  // 1. Register device + get device_id
  console.log('[startup] registering device...')
  const { device_id: deviceId } = await api.heartbeat({
    hostname: hostname(),
    platform: platform(),
    claudePath,
    name: config.name ?? hostname(),
    macAddress: getMacAddress(),
  })
  console.log(`[startup] device_id: ${deviceId}`)

  const hashCache = loadHashCache()

  // 2. Pull any changes missed while offline
  console.log('[startup] pulling queued changes...')
  await pullAndApply({ api, deviceId, claudePath, hashCache })

  // 3. Subscribe to Realtime broadcast channel for instant push notifications
  const supabase = createClient(supabaseUrl, config.supabaseAnonKey ?? 'anon-placeholder', {
    realtime: { params: { eventsPerSecond: 10 } },
  })

  supabase
    .channel(`device:${deviceId}`)
    .on('broadcast', { event: 'change' }, async () => {
      await pullAndApply({ api, deviceId, claudePath, hashCache })
    })
    .on('broadcast', { event: 'restart' }, () => {
      console.log('[restart] restart requested from dashboard — exiting')
      process.exit(0)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') console.log('[realtime] connected')
      if (status === 'CHANNEL_ERROR') console.warn('[realtime] channel error — falling back to polling')
    })

  // 4. Poll as fallback (Realtime may not always be available)
  setInterval(() => {
    pullAndApply({ api, deviceId, claudePath, hashCache })
  }, POLL_INTERVAL_MS)

  // 5. Watch ~/.claude for local changes
  startWatcher({ claudePath, deviceId, hashCache, api, chokidar, saveHashCache })

  // 6. Heartbeat every 30s
  setInterval(async () => {
    try {
      await api.heartbeat({
        hostname: hostname(),
        platform: platform(),
        claudePath,
        name: config.name ?? hostname(),
      })
    } catch (err) { console.error('[heartbeat error]', err.message) }
  }, POLL_INTERVAL_MS)

  console.log('[ready] ClaudeSync agent running')
}

main().catch(err => {
  console.error('[fatal]', err)
  process.exit(1)
})
