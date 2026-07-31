import { createHash } from 'crypto'
import { readFileSync } from 'fs'

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

export class ApiClient {
  constructor({ supabaseUrl, agentToken }) {
    this.base = `${supabaseUrl}/functions/v1`
    this.headers = {
      'Authorization': `Bearer ${agentToken}`,
      'Content-Type': 'application/json',
    }
  }

  async heartbeat({ hostname, platform, claudePath, name, agentVersion = '1.0.0', macAddress, deviceUuid }) {
    const res = await fetch(`${this.base}/heartbeat`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ hostname, platform, claude_path: claudePath, name, agent_version: agentVersion, mac_address: macAddress, device_uuid: deviceUuid }),
    })
    // The status alone cannot tell a blocked device from a bad token, and both
    // are things the user has to act on — carry the body and the code through so
    // the fatal handler can explain which one happened.
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      const err = new Error(`heartbeat failed: ${res.status}${detail ? ` ${detail}` : ''}`)
      err.status = res.status
      throw err
    }
    return res.json()
  }

  async push({ deviceId, filePath, content, hash, operation }) {
    const body = { device_id: deviceId, file_path: filePath, operation }
    if (operation === 'upsert') {
      body.content_base64 = Buffer.from(content).toString('base64')
      body.hash = hash
    }
    const res = await fetch(`${this.base}/sync-push`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`sync-push failed: ${res.status} ${text}`)
    }
    return res.json()
  }

  async discover(deviceId, localFiles) {
    const res = await fetch(`${this.base}/sync-discover`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ device_id: deviceId, local_files: localFiles }),
    })
    if (!res.ok) throw new Error(`sync-discover failed: ${res.status}`)
    return res.json()
  }

  /**
   * `syncedPaths` is what the server clears from the pending list. Anything
   * omitted stays pending on purpose — a push that threw must not leave the
   * dashboard claiming the device is up to date.
   */
  async syncComplete(deviceId, syncedPaths, failed) {
    const res = await fetch(`${this.base}/sync-complete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        device_id: deviceId,
        synced_paths: syncedPaths ?? [],
        failed: failed ?? [],
      }),
    })
    if (!res.ok) throw new Error(`sync-complete failed: ${res.status}`)
    return res.json()
  }
}
