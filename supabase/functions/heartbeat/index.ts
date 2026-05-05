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

  const { name, hostname, platform, claude_path, agent_version } = await req.json()
  if (!hostname || !platform || !claude_path) return errorResponse('Missing required fields')

  const { data, error } = await supabase
    .from('devices')
    .upsert({
      user_id: userId,
      name: name ?? hostname,
      hostname,
      platform,
      claude_path,
      agent_version: agent_version ?? '1.0.0',
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,hostname' })
    .select('id')
    .single()

  if (error) return errorResponse(error.message, 500)

  return okResponse({ ok: true, device_id: data.id })
})
