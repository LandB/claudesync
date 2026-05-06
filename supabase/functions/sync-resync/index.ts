import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (!user) return json({ error: 'Unauthorized' }, 401)
  const userId = user.id

  const { device_id } = await req.json()
  if (!device_id) return json({ error: 'Missing device_id' }, 400)

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', device_id)
    .eq('user_id', userId)
    .single()

  if (!device) return json({ error: 'Device not found' }, 404)

  const { data: files, error } = await supabase
    .from('sync_files')
    .select('user_id, path, storage_path, hash')
    .eq('user_id', userId)
    .eq('deleted', false)

  if (error) return json({ error: error.message }, 500)
  if (!files || files.length === 0) return json({ queued: 0 })

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

  if (insertError) return json({ error: insertError.message }, 500)

  return json({ queued: entries.length })
})
