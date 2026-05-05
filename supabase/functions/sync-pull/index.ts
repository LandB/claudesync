import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateToken, unauthorizedResponse, errorResponse, okResponse } from '../_shared/auth.ts'

serve(async (req) => {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const userId = await validateToken(req, supabase)
  if (!userId) return unauthorizedResponse()

  const url = new URL(req.url)
  const deviceId = url.searchParams.get('device_id')
  if (!deviceId) return errorResponse('Missing device_id query param')

  const { data: items, error } = await supabase
    .from('change_queue')
    .select('id, file_path, operation, storage_path, hash')
    .eq('user_id', userId)
    .eq('target_device', deviceId)
    .eq('delivered', false)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return errorResponse(error.message, 500)

  if (!items || items.length === 0) return okResponse({ items: [] })

  // Generate signed URLs for upsert items
  const itemsWithUrls = await Promise.all(items.map(async (item) => {
    if (item.operation !== 'upsert' || !item.storage_path) return item
    const { data: signed } = await supabase.storage
      .from('claude-env')
      .createSignedUrl(item.storage_path, 3600)
    return { ...item, download_url: signed?.signedUrl ?? null }
  }))

  // Mark all delivered
  const ids = items.map(i => i.id)
  await supabase
    .from('change_queue')
    .update({ delivered: true, delivered_at: new Date().toISOString() })
    .in('id', ids)

  return okResponse({ items: itemsWithUrls })
})
