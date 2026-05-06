import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { normalizePluginPaths } from './normalize-plugin-paths.js'

const APPLY_BLOCKLIST = [
  /^plugins[/\\]marketplaces([/\\]|$)/,
  /^plugins[/\\]cache([/\\]|$)/,
]

function isBlocked(filePath) {
  return APPLY_BLOCKLIST.some(re => re.test(filePath))
}

export async function applyChange(item, claudePath, hashCache) {
  if (isBlocked(item.file_path)) {
    console.log(`[skip] blocked path: ${item.file_path}`)
    return
  }
  const absPath = join(claudePath, item.file_path)

  if (item.operation === 'delete') {
    if (existsSync(absPath)) {
      unlinkSync(absPath)
      console.log(`[delete] ${item.file_path}`)
    }
    hashCache.delete(item.file_path)
    return
  }

  // upsert — download via signed URL
  if (!item.download_url) {
    console.warn(`[skip] no download_url for ${item.file_path}`)
    return
  }

  const res = await fetch(item.download_url)
  if (!res.ok) {
    console.error(`[error] download failed for ${item.file_path}: ${res.status}`)
    return
  }

  const content = normalizePluginPaths(item.file_path, Buffer.from(await res.arrayBuffer()), claudePath)
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, content)
  hashCache.set(item.file_path, item.hash)
  console.log(`[pull] ${item.file_path}`)
}
