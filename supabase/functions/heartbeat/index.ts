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

  const { name, hostname, platform, claude_path, agent_version, mac_address } = await req.json()
  if (!hostname || !platform || !claude_path) return errorResponse('Missing required fields')

  // Check blocklist
  const blockQuery = supabase
    .from('device_blocklist')
    .select('id')
    .eq('user_id', userId)

  const { data: blocked } = mac_address
    ? await blockQuery.or(`mac_address.eq.${mac_address},hostname.eq.${hostname}`).maybeSingle()
    : await blockQuery.eq('hostname', hostname).maybeSingle()

  if (blocked) return errorResponse('Device is blocked', 403)

  let data: { id: string } | null = null
  let error: unknown = null

  if (mac_address) {
    const { data: existing } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .eq('mac_address', mac_address)
      .maybeSingle()

    if (existing) {
      const res = await supabase
        .from('devices')
        .update({
          name: name ?? hostname,
          hostname,
          platform,
          claude_path,
          agent_version: agent_version ?? '1.0.0',
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id')
        .single()
      data = res.data; error = res.error
    } else {
      const res = await supabase
        .from('devices')
        .insert({
          user_id: userId,
          name: name ?? hostname,
          hostname,
          platform,
          claude_path,
          mac_address,
          agent_version: agent_version ?? '1.0.0',
          last_seen_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      data = res.data; error = res.error
    }
  } else {
    const res = await supabase
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
    data = res.data; error = res.error
  }

  if (error) return errorResponse((error as Error).message, 500)

  return okResponse({ ok: true, device_id: data!.id })
})
