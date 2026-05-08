import { readFileSync } from 'fs'
import { relative } from 'path'
import { sha256 } from './api.js'
import { sanitizePluginPaths, sanitizeHomePath } from './sanitize-plugin-paths.js'

// Chokidar-level: skip entire subtrees for performance
const CHOKIDAR_IGNORE = [
  /[/\\]\.git([/\\]|$)/,
  /[/\\]node_modules([/\\]|$)/,
  /[/\\]plugins[/\\]cache([/\\]|$)/,
  /[/\\]plugins[/\\]marketplaces([/\\]|$)/,  // managed by Claude Code, not ours to sync
  /[/\\]projects([/\\]|$)/,
  /[/\\]statsig([/\\]|$)/,
  /[/\\]sessions([/\\]|$)/,
  /[/\\]cache([/\\]|$)/,
  /[/\\]backups([/\\]|$)/,
  /[/\\]ide([/\\]|$)/,
]

// Only sync files whose path (relative to claudePath) matches one of these
const SYNC_ALLOWLIST = [
  /^settings\.json$/,
  /^settings\.local\.json$/,
  /^CLAUDE\.md$/i,
  /^\.caveman-active$/,
  /^keybindings\.json$/,
  /^skills\//,
  /^plugins\//,   // plugins/cache already excluded by CHOKIDAR_IGNORE
]

const JUNK = [/\.DS_Store$/, /\.swp$/, /\.tmp$/, /~$/]

function isAllowed(relPath) {
  if (JUNK.some(re => re.test(relPath))) return false
  return SYNC_ALLOWLIST.some(re => re.test(relPath))
}

export function startWatcher({ claudePath, deviceId, hashCache, api, chokidar, saveHashCache }) {
  const timers = new Map()

  const watcher = chokidar.watch(claudePath, {
    ignoreInitial: false,
    persistent: true,
    ignored: (absPath) => CHOKIDAR_IGNORE.some(re => re.test(absPath)),
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })

  async function handleChange(absPath, operation) {
    const filePath = relative(claudePath, absPath)
    if (!isAllowed(filePath)) return

    clearTimeout(timers.get(filePath))
    timers.set(filePath, setTimeout(async () => {
      timers.delete(filePath)
      try {
        if (operation === 'upsert') {
          let raw
          try { raw = readFileSync(absPath) } catch { return }
          const rawHash = sha256(raw)
          if (hashCache.get(filePath) === rawHash) return
          hashCache.set(filePath, rawHash)
          const content = sanitizeHomePath(sanitizePluginPaths(filePath, raw, claudePath), claudePath)
          const hash = sha256(content)
          await api.push({ deviceId, filePath, content, hash, operation: 'upsert' })
          saveHashCache?.(hashCache)
          console.log(`[push] ${filePath}`)
        } else {
          hashCache.delete(filePath)
          await api.push({ deviceId, filePath, operation: 'delete' })
          saveHashCache?.(hashCache)
          console.log(`[delete→push] ${filePath}`)
        }
      } catch (err) {
        console.error(`[error] push ${filePath}: ${err.message}`)
        // Remove from cache so next change retries
        hashCache.delete(filePath)
      }
    }, 200))
  }

  watcher
    .on('add',    p => handleChange(p, 'upsert'))
    .on('change', p => handleChange(p, 'upsert'))
    .on('unlink', p => handleChange(p, 'delete'))
    .on('error',  err => console.error('[watcher error]', err))

  console.log(`[watch] ${claudePath}`)
  return watcher
}
