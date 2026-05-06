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

  async heartbeat({ hostname, platform, claudePath, name, agentVersion = '1.0.0', macAddress }) {
    const res = await fetch(`${this.base}/heartbeat`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ hostname, platform, claude_path: claudePath, name, agent_version: agentVersion, mac_address: macAddress }),
    })
    if (!res.ok) throw new Error(`heartbeat failed: ${res.status}`)
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

  async pull(deviceId) {
    const res = await fetch(`${this.base}/sync-pull?device_id=${deviceId}`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`sync-pull failed: ${res.status}`)
    return res.json()
  }
}
