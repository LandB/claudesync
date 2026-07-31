import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateToken, unauthorizedResponse, errorResponse, okResponse } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
      .upload(storagePath, bytes, { upsert: true, contentType: 'text/plain', cacheControl: '0' })

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

  // No fanout here on purpose. ClaudeSync is manual-sync: change_queue was
  // dropped in 20260508000002_manual_sync.sql, and the agent has no handler for
  // a push notification. Other devices receive this file when the user runs
  // "Send files to this machine" (snapshot) or a targeted pull-files.
  return okResponse({ ok: true })
})
