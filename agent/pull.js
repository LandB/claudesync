#!/usr/bin/env node
import { createHash } from 'crypto'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { loadConfig } from './lib/config.js'
import { loadHashCache, saveHashCache } from './lib/hash-cache.js'
import { expandPluginPaths, expandHomePath } from './lib/sanitize-plugin-paths.js'

const configPath = process.env.CLAUDESYNC_CONFIG
const config = loadConfig(configPath)
const { supabaseUrl, agentToken, claudePath } = config

async function fetchSnapshot() {
  const res = await fetch(`${supabaseUrl}/functions/v1/sync-snapshot`, {
    headers: { 'Authorization': `Bearer ${agentToken}` },
  })
  if (!res.ok) throw new Error(`sync-snapshot failed: ${res.status}`)
  return res.json()
}

function localHash(absPath) {
  try { return createHash('sha256').update(readFileSync(absPath)).digest('hex') }
  catch { return null }
}

async function main() {
  console.log('[pull] fetching server snapshot...')
  const { files } = await fetchSnapshot()
  console.log(`[pull] ${files.length} file(s) on server`)

  const hashCache = loadHashCache()
  let pulled = 0, skipped = 0, failed = 0

  for (const f of files) {
    const absPath = join(claudePath, f.path)

    // Files with path tokens are stored tokenized on the server so local hash
    // never matches. Fall through to re-download; localHash check still skips
    // non-tokenized files that are already up-to-date.
    if (localHash(absPath) === f.hash) {
      hashCache.set(f.path, f.hash)
      skipped++
      continue
    }

    if (!f.download_url) {
      console.warn(`[skip] no download_url for ${f.path}`)
      failed++
      continue
    }

    const res = await fetch(f.download_url)
    if (!res.ok) {
      console.error(`[error] download failed for ${f.path}: ${res.status}`)
      failed++
      continue
    }

    const raw = Buffer.from(await res.arrayBuffer())
    const content = expandHomePath(expandPluginPaths(f.path, raw, claudePath), claudePath)
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, content)
    hashCache.set(f.path, f.hash)
    console.log(`[pull] ${f.path}`)
    pulled++
  }

  saveHashCache(hashCache)
  console.log(`\ndone — ${pulled} pulled, ${skipped} already up-to-date, ${failed} failed`)
}

main().catch(err => { console.error('[fatal]', err.message); process.exit(1) })
