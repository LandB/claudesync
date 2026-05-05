import { readFileSync } from 'fs'
import { relative } from 'path'
import { sha256 } from './api.js'

const IGNORE = [
  /[/\\]\.git([/\\]|$)/,
  /[/\\]node_modules([/\\]|$)/,
  /[/\\]plugins[/\\]cache([/\\]|$)/,
  /[/\\]projects([/\\]|$)/,   // per-project data, not global
  /[/\\]statsig([/\\]|$)/,    // analytics cache
  /\.DS_Store$/,
  /\.swp$/,
  /\.tmp$/,
  /~$/,
]

function isIgnored(absPath) {
  return IGNORE.some(re => re.test(absPath))
}

export function startWatcher({ claudePath, deviceId, hashCache, api, chokidar }) {
  const timers = new Map()

  const watcher = chokidar.watch(claudePath, {
    ignoreInitial: true,
    persistent: true,
    ignored: isIgnored,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })

  async function handleChange(absPath, operation) {
    if (isIgnored(absPath)) return
    const filePath = relative(claudePath, absPath)

    clearTimeout(timers.get(filePath))
    timers.set(filePath, setTimeout(async () => {
      timers.delete(filePath)
      try {
        if (operation === 'upsert') {
          let content
          try { content = readFileSync(absPath) } catch { return }
          const hash = sha256(content)
          if (hashCache.get(filePath) === hash) return
          hashCache.set(filePath, hash)
          await api.push({ deviceId, filePath, content, hash, operation: 'upsert' })
          console.log(`[push] ${filePath}`)
        } else {
          hashCache.delete(filePath)
          await api.push({ deviceId, filePath, operation: 'delete' })
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
