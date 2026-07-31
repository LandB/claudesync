import { supabase } from './supabase'

/**
 * Send a one-shot realtime command to a device's channel.
 *
 * Resolves once the message is away — the agent acts asynchronously and reports
 * back through the database, so there is nothing to await beyond delivery.
 */
export async function broadcastToDevice(deviceId, event, payload = {}) {
  await new Promise((resolve) => {
    const ch = supabase.channel(`device:${deviceId}`)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event, payload })
          .finally(() => { supabase.removeChannel(ch); resolve() })
      }
    })
  })
}

/**
 * Make a device's copy of a file the server copy.
 *
 * The agent's `sync` handler reads the file off that machine and pushes it, so
 * this resolves a conflict in favour of whichever device is named.
 */
export async function takeVersionFrom(deviceId, filePath) {
  await broadcastToDevice(deviceId, 'sync', { files: [filePath] })
}
