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

  const { data: files, error } = await supabase
    .from('sync_files')
    .select('path, hash, storage_path')
    .eq('user_id', userId)
    .eq('deleted', false)

  if (error) return errorResponse(error.message, 500)
  if (!files || files.length === 0) return okResponse({ files: [] })

  const filesWithUrls = await Promise.all(files.map(async (f) => {
    const { data: signed } = await supabase.storage
      .from('claude-env')
      .createSignedUrl(f.storage_path, 3600)
    return { path: f.path, hash: f.hash, download_url: signed?.signedUrl ?? null }
  }))

  return okResponse({ files: filesWithUrls })
})
