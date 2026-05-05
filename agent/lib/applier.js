import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { dirname, join } from 'path'

export async function applyChange(item, claudePath, hashCache) {
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

  const content = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, content)
  hashCache.set(item.file_path, item.hash)
  console.log(`[pull] ${item.file_path}`)
}
