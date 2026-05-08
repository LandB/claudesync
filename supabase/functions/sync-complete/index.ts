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

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', device_id)
    .eq('user_id', userId)
    .single()

  if (!device) return errorResponse('Device not found', 404)

  await supabase.from('discovery_results').delete().eq('device_id', device_id)
  await supabase
    .from('devices')
    .update({ last_discovered_at: new Date().toISOString() })
    .eq('id', device_id)

  return okResponse({ ok: true })
})
