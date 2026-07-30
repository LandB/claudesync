import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateToken, unauthorizedResponse, errorResponse, okResponse } from '../_shared/auth.ts'

type DeviceRow = { id: string }

/**
 * Finds a device row that predates stable device_uuid support, so an upgraded
 * agent adopts its existing row (and with it the file history, conflict log and
 * realtime channel) instead of registering as a new machine.
 *
 * Only rows with a null device_uuid are eligible: a row already claimed by
 * another machine must never be stolen by a MAC or hostname collision.
 */
async function findLegacyDevice(
  supabase: SupabaseClient,
  userId: string,
  macAddress: string | null,
  hostname: string
): Promise<DeviceRow | null> {
  if (macAddress) {
    const { data } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .eq('mac_address', macAddress)
      .is('device_uuid', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (data) return data
  }

  const { data } = await supabase
    .from('devices')
    .select('id')
    .eq('user_id', userId)
    .eq('hostname', hostname)
    .is('device_uuid', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

serve(async (req) => {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const userId = await validateToken(req, supabase)
  if (!userId) return unauthorizedResponse()

  const { name, hostname, platform, claude_path, agent_version, mac_address, device_uuid } =
    await req.json()
  if (!hostname || !platform || !claude_path) return errorResponse('Missing required fields')

  const macAddress: string | null = mac_address ?? null
  const deviceUuid: string | null = device_uuid ?? null

  // Blocklist rows are matched in memory rather than by interpolating
  // client-supplied values into a PostgREST filter string, which let a crafted
  // mac_address or hostname rewrite the filter and evade the block. The lookup
  // also fails closed: an error here must not read as "not blocked".
  const { data: blocklist, error: blockError } = await supabase
    .from('device_blocklist')
    .select('device_uuid, mac_address, hostname')
    .eq('user_id', userId)

  if (blockError) return errorResponse('Blocklist lookup failed', 500)

  const isBlocked = (blocklist ?? []).some((row) => {
    // Rows carrying a device_uuid block exactly one machine.
    if (row.device_uuid) return deviceUuid !== null && row.device_uuid === deviceUuid
    // Rows written before stable ids existed fall back to the old, looser keys.
    if (row.mac_address && macAddress) return row.mac_address === macAddress
    return row.hostname === hostname
  })

  if (isBlocked) return errorResponse('Device is blocked', 403)

  const fields = {
    name: name ?? hostname,
    hostname,
    platform,
    claude_path,
    agent_version: agent_version ?? '1.0.0',
    last_seen_at: new Date().toISOString(),
  }

  let data: DeviceRow | null = null
  let error: unknown = null

  if (deviceUuid) {
    const { data: byUuid } = await supabase
      .from('devices')
      .select('id')
      .eq('user_id', userId)
      .eq('device_uuid', deviceUuid)
      .maybeSingle()

    const target = byUuid ?? (await findLegacyDevice(supabase, userId, macAddress, hostname))

    if (target) {
      const res = await supabase
        .from('devices')
        .update({ ...fields, mac_address: macAddress, device_uuid: deviceUuid })
        .eq('id', target.id)
        .select('id')
        .single()
      data = res.data; error = res.error
    } else {
      // upsert rather than insert so two heartbeats racing at startup settle on
      // one row instead of one of them failing on the unique index.
      const res = await supabase
        .from('devices')
        .upsert(
          { user_id: userId, device_uuid: deviceUuid, mac_address: macAddress, ...fields },
          { onConflict: 'user_id,device_uuid' }
        )
        .select('id')
        .single()
      data = res.data; error = res.error
    }
  } else {
    // Agent predating stable device ids. Best effort: match on the old keys,
    // otherwise register a row that a later upgraded heartbeat can adopt.
    const target = await findLegacyDevice(supabase, userId, macAddress, hostname)

    if (target) {
      const res = await supabase
        .from('devices')
        .update({ ...fields, mac_address: macAddress })
        .eq('id', target.id)
        .select('id')
        .single()
      data = res.data; error = res.error
    } else {
      const res = await supabase
        .from('devices')
        .insert({ user_id: userId, mac_address: macAddress, ...fields })
        .select('id')
        .single()
      data = res.data; error = res.error
    }
  }

  if (error) return errorResponse((error as Error).message, 500)

  return okResponse({ ok: true, device_id: data!.id })
})
