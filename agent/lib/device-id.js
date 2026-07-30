import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_DIR = join(homedir(), '.claudesync')
const DEVICE_ID_PATH = join(CONFIG_DIR, 'device-id')

/**
 * Stable per-machine identity, persisted to disk.
 *
 * hostname and MAC address both drift on macOS — DHCP hands out hostnames that
 * change with the network, and private Wi-Fi addresses rotate — so neither can
 * identify a machine across restarts. This UUID is generated once and reused.
 */
export function getDeviceUuid(path = DEVICE_ID_PATH) {
  try {
    const existing = readFileSync(path, 'utf8').trim()
    if (existing) return existing
  } catch {
    // Not created yet — fall through and generate one.
  }

  const uuid = randomUUID()
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(path, `${uuid}\n`, { mode: 0o600 })
  return uuid
}
