import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { device_id } = await req.json()
  if (!device_id) return json({ error: 'Missing device_id' }, 400)

  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', device_id)
    .eq('user_id', user.id)
    .single()

  if (!device) return json({ error: 'Device not found' }, 404)

  await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'apikey': SERVICE_ROLE,
    },
    body: JSON.stringify({
      messages: [{
        topic: `realtime:device:${device_id}`,
        event: 'restart',
        payload: {},
        private: false,
      }]
    }),
  })

  return json({ ok: true })
})
