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

  const fields = {
    name: name ?? hostname,
    hostname,
    platform,
    claude_path,
    agent_version: agent_version ?? '1.0.0',
    last_seen_at: new Date().toISOString(),
  }

  let data: { id: string } | null = null
  let error: unknown = null

  if (mac_address) {
    // Try to find existing device by mac
    const { data: byMac } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .eq('mac_address', mac_address)
      .maybeSingle()

    if (byMac) {
      // Update existing device found by mac
      const res = await supabase
        .from('devices')
        .update(fields)
        .eq('id', byMac.id)
        .select('id')
        .single()
      data = res.data; error = res.error
    } else {
      // Fall back: find device registered before mac support (by hostname)
      const { data: byHostname } = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', userId)
        .eq('hostname', hostname)
        .is('mac_address', null)
        .maybeSingle()

      if (byHostname) {
        // Update old device with mac_address
        const res = await supabase
          .from('devices')
          .update({ ...fields, mac_address })
          .eq('id', byHostname.id)
          .select('id')
          .single()
        data = res.data; error = res.error

        // Delete any duplicate row that was created via the broken insert path
        if (data) {
          await supabase
            .from('devices')
            .delete()
            .eq('user_id', userId)
            .eq('mac_address', mac_address)
            .neq('id', data.id)
        }
      } else {
        // No existing device — insert fresh
        const res = await supabase
          .from('devices')
          .insert({ user_id: userId, mac_address, ...fields })
          .select('id')
          .single()
        data = res.data; error = res.error
      }
    }
  } else {
    const res = await supabase
      .from('devices')
      .upsert(
        { user_id: userId, ...fields },
        { onConflict: 'user_id,hostname' }
      )
      .select('id')
      .single()
    data = res.data; error = res.error
  }

  if (error) return errorResponse((error as Error).message, 500)

  return okResponse({ ok: true, device_id: data!.id })
})
