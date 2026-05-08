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

  const { device_id, local_files } = await req.json()
  if (!device_id) return errorResponse('Missing device_id')

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', device_id)
    .eq('user_id', userId)
    .single()

  if (!device) return errorResponse('Device not found', 404)

  const { data: serverFiles } = await supabase
    .from('sync_files')
    .select('path, hash')
    .eq('user_id', userId)
    .eq('deleted', false)

  const serverMap = new Map<string, string>((serverFiles ?? []).map((f: { path: string; hash: string }) => [f.path, f.hash]))
  const localMap = new Map<string, string>((local_files ?? []).map((f: { path: string; hash: string }) => [f.path, f.hash]))

  const diffs: { device_id: string; file_path: string; local_hash: string; server_hash: string | null; status: string }[] = []
  for (const [path, localHash] of localMap) {
    const serverHash = serverMap.get(path) ?? null
    if (serverHash !== localHash) {
      diffs.push({ device_id, file_path: path, local_hash: localHash, server_hash: serverHash, status: 'discovered' })
    }
  }

  await supabase.from('discovery_results').delete().eq('device_id', device_id)

  if (diffs.length > 0) {
    await supabase.from('discovery_results').insert(diffs)
  }

  await supabase
    .from('devices')
    .update({ last_discovered_at: new Date().toISOString() })
    .eq('id', device_id)

  return okResponse({ diffs: diffs.length })
})
