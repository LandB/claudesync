import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateToken, unauthorizedResponse, errorResponse, okResponse } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function broadcastToDevice(deviceId: string, payload: unknown) {
  // Supabase Realtime REST broadcast API
  await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'apikey': SERVICE_ROLE,
    },
    body: JSON.stringify({
      messages: [{
        topic: `realtime:device:${deviceId}`,
        event: 'change',
        payload,
        private: false,
      }]
    }),
  }).catch(() => { /* best-effort — agent polls as fallback */ })
}

serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const userId = await validateToken(req, supabase)
  if (!userId) return unauthorizedResponse()

  const { device_id, file_path, content_base64, hash, operation } = await req.json()
  if (!device_id || !file_path || !operation) return errorResponse('Missing required fields')
  if (!['upsert', 'delete'].includes(operation)) return errorResponse('Invalid operation')

  const storagePath = `${userId}/${file_path}`

  if (operation === 'upsert') {
    if (content_base64 === undefined || content_base64 === null || !hash) return errorResponse('Missing content_base64 or hash for upsert')

    const bytes = Uint8Array.from(atob(content_base64), c => c.charCodeAt(0))
    const { error: uploadError } = await supabase.storage
      .from('claude-env')
      .upload(storagePath, bytes, { upsert: true, contentType: 'text/plain' })

    if (uploadError) return errorResponse(uploadError.message, 500)

    // Conflict check
    const { data: existing } = await supabase
      .from('sync_files')
      .select('hash, updated_by')
      .eq('user_id', userId)
      .eq('path', file_path)
      .single()

    if (existing && existing.hash !== hash && existing.updated_by !== device_id) {
      await supabase.from('conflict_log').insert({
        user_id: userId,
        file_path,
        winning_device: device_id,
        losing_device: existing.updated_by,
        winning_hash: hash,
        losing_hash: existing.hash,
      })
    }

    await supabase.from('sync_files').upsert({
      user_id: userId,
      path: file_path,
      hash,
      storage_path: storagePath,
      size_bytes: bytes.length,
      updated_by: device_id,
      updated_at: new Date().toISOString(),
      deleted: false,
    }, { onConflict: 'user_id,path' })
  } else {
    await supabase.storage.from('claude-env').remove([storagePath])
    await supabase
      .from('sync_files')
      .update({ deleted: true, updated_by: device_id, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('path', file_path)
  }

  // Enqueue for other devices + broadcast
  const { data: otherDevices } = await supabase
    .from('devices')
    .select('id')
    .eq('user_id', userId)
    .neq('id', device_id)

  if (otherDevices && otherDevices.length > 0) {
    await supabase.from('change_queue').insert(
      otherDevices.map(d => ({
        user_id: userId,
        target_device: d.id,
        file_path,
        operation,
        storage_path: operation === 'upsert' ? storagePath : null,
        hash: operation === 'upsert' ? hash : null,
      }))
    )
    await Promise.all(otherDevices.map(d =>
      broadcastToDevice(d.id, { file_path, operation })
    ))
  }

  return okResponse({ ok: true })
})
