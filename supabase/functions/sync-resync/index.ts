import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateToken, unauthorizedResponse, errorResponse, okResponse } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const userId = await validateToken(req, supabase)
  if (!userId) return unauthorizedResponse()

  const { device_id } = await req.json()
  if (!device_id) return errorResponse('Missing device_id')

  // Verify device belongs to user
  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', device_id)
    .eq('user_id', userId)
    .single()

  if (!device) return errorResponse('Device not found', 404)

  const { data: files, error } = await supabase
    .from('sync_files')
    .select('user_id, path, storage_path, hash')
    .eq('user_id', userId)
    .eq('deleted', false)

  if (error) return errorResponse(error.message, 500)
  if (!files || files.length === 0) return okResponse({ queued: 0 })

  // Clear existing undelivered items for this device to avoid duplicates
  await supabase
    .from('change_queue')
    .delete()
    .eq('target_device', device_id)
    .eq('delivered', false)

  const entries = files.map(f => ({
    user_id: userId,
    target_device: device_id,
    file_path: f.path,
    operation: 'upsert',
    storage_path: f.storage_path,
    hash: f.hash,
  }))

  const { error: insertError } = await supabase
    .from('change_queue')
    .insert(entries)

  if (insertError) return errorResponse(insertError.message, 500)

  return okResponse({ queued: entries.length })
})
