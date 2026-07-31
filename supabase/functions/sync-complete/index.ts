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

  const { device_id, synced_paths, failed } = await req.json() as {
    device_id?: string
    synced_paths?: string[]
    failed?: { path: string; error: string }[]
  }
  if (!device_id) return errorResponse('Missing device_id')

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', device_id)
    .eq('user_id', userId)
    .single()

  if (!device) return errorResponse('Device not found', 404)

  // Agents before the partial-sync fix send no synced_paths and expect the old
  // behaviour: the whole pending list is cleared once the run finishes.
  if (!Array.isArray(synced_paths)) {
    await supabase.from('discovery_results').delete().eq('device_id', device_id)
  } else if (synced_paths.length > 0) {
    await supabase
      .from('discovery_results')
      .delete()
      .eq('device_id', device_id)
      .in('file_path', synced_paths)
  }

  // Whatever failed stays pending — otherwise the dashboard reports "up to date"
  // for a file that never reached the server.
  for (const f of failed ?? []) {
    await supabase
      .from('discovery_results')
      .update({ status: 'failed', error: f.error?.slice(0, 500) ?? 'push failed' })
      .eq('device_id', device_id)
      .eq('file_path', f.path)
  }

  await supabase
    .from('devices')
    .update({ last_discovered_at: new Date().toISOString() })
    .eq('id', device_id)

  return okResponse({
    ok: true,
    cleared: Array.isArray(synced_paths) ? synced_paths.length : null,
    failed: failed?.length ?? 0,
  })
})
