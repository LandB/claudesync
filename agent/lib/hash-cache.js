import { readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CACHE_PATH = join(homedir(), '.claudesync', 'hash-cache.json')

export function loadHashCache() {
  try {
    return new Map(Object.entries(JSON.parse(readFileSync(CACHE_PATH, 'utf8'))))
  } catch {
    return new Map()
  }
}

export function saveHashCache(map) {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(Object.fromEntries(map)), 'utf8')
  } catch { /* non-fatal */ }
}
