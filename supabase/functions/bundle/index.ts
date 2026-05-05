import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateToken, unauthorizedResponse, errorResponse } from '../_shared/auth.ts'

// deno-lint-ignore no-explicit-any
type JSZipType = any

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
    .select('path, storage_path')
    .eq('user_id', userId)
    .eq('deleted', false)

  if (error) return errorResponse(error.message, 500)
  if (!files || files.length === 0) {
    return new Response(new Uint8Array(0), {
      status: 200,
      headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="claude-env.zip"' },
    })
  }

  const { default: JSZip }: { default: JSZipType } = await import('https://esm.sh/jszip@3.10.1')
  const zip = new JSZip()

  await Promise.all(files.map(async (file) => {
    const { data, error: dlError } = await supabase.storage
      .from('claude-env')
      .download(file.storage_path)
    if (dlError || !data) return
    const bytes = new Uint8Array(await data.arrayBuffer())
    zip.file(file.path, bytes)
  }))

  const zipBytes = await zip.generateAsync({ type: 'uint8array' })

  return new Response(zipBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="claude-env.zip"',
    },
  })
})
