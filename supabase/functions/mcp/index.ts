import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function ok(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result })
}

function rpcErr(id: unknown, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } })
}

function toolOk(text: string) {
  return { content: [{ type: 'text', text }] }
}

function toolErr(text: string) {
  return { isError: true, content: [{ type: 'text', text }] }
}

async function resolveUser(req: Request, supabase: SupabaseClient): Promise<string | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data } = await supabase.from('profiles').select('id').eq('token', token).single()
  return data?.id ?? null
}

const TOOLS = [
  {
    name: 'sync_push',
    description: 'Push a local file to ClaudeSync storage so other devices receive it.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string', description: 'Calling device UUID' },
        file_path: { type: 'string', description: 'Relative path inside ~/.claude, e.g. CLAUDE.md' },
        content:   { type: 'string', description: 'Full file content (text)' },
        operation: { type: 'string', enum: ['upsert', 'delete'] },
      },
      required: ['device_id', 'file_path', 'operation'],
    },
  },
  {
    name: 'sync_pull',
    description: 'Pull pending file changes queued for this device.',
    inputSchema: {
      type: 'object',
      properties: { device_id: { type: 'string' } },
      required: ['device_id'],
    },
  },
  {
    name: 'device_status',
    description: 'List all registered devices and last-seen timestamps.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_skills',
    description: 'Search the community plugin/skill registry.',
    inputSchema: {
      type: 'object',
      properties: {
        query:  { type: 'string', description: 'Optional search term' },
        source: { type: 'string', enum: ['npm', 'awesome-mcp', 'manual'] },
      },
    },
  },
  {
    name: 'install_skill',
    description: 'Install a skill from the registry into your ClaudeSync environment.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string' },
        name:      { type: 'string', description: 'Skill name from list_skills' },
      },
      required: ['device_id', 'name'],
    },
  },
  {
    name: 'install_plugin',
    description: 'Install an MCP plugin from the registry into your ClaudeSync environment.',
    inputSchema: {
      type: 'object',
      properties: {
        device_id: { type: 'string' },
        name:      { type: 'string', description: 'Plugin name from list_skills' },
      },
      required: ['device_id', 'name'],
    },
  },
  {
    name: 'diff',
    description: 'Compare a local file against the version stored in ClaudeSync.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path:     { type: 'string' },
        local_content: { type: 'string', description: 'Current local content to compare' },
      },
      required: ['file_path', 'local_content'],
    },
  },
]

async function handleSyncPush(userId: string, args: Record<string,string>, supabase: SupabaseClient) {
  const { device_id, file_path, content, operation } = args
  if (!device_id || !file_path || !operation) return toolErr('Missing required fields')
  const storagePath = `${userId}/${file_path}`

  if (operation === 'upsert') {
    if (!content) return toolErr('content required for upsert')
    const bytes = new TextEncoder().encode(content)
    const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
    const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')

    const { error: uploadErr } = await supabase.storage
      .from('claude-env').upload(storagePath, bytes, { upsert: true, contentType: 'text/plain' })
    if (uploadErr) return toolErr(`Storage error: ${uploadErr.message}`)

    await supabase.from('sync_files').upsert({
      user_id: userId, path: file_path, hash, storage_path: storagePath,
      size_bytes: bytes.length, updated_by: device_id,
      updated_at: new Date().toISOString(), deleted: false,
    }, { onConflict: 'user_id,path' })

    const { data: others } = await supabase.from('devices').select('id')
      .eq('user_id', userId).neq('id', device_id)
    if (others?.length) {
      await supabase.from('change_queue').insert(
        others.map((d: {id: string}) => ({
          user_id: userId, target_device: d.id, file_path,
          operation, storage_path: storagePath, hash,
        }))
      )
    }
    return toolOk(`Pushed ${file_path} (${bytes.length}B, hash:${hash.slice(0,12)}…) — queued for ${others?.length ?? 0} device(s)`)
  } else {
    await supabase.storage.from('claude-env').remove([storagePath])
    await supabase.from('sync_files')
      .update({ deleted: true, updated_by: device_id, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('path', file_path)
    return toolOk(`Deleted ${file_path} from ClaudeSync`)
  }
}

async function handleSyncPull(userId: string, args: Record<string,string>, supabase: SupabaseClient) {
  const { device_id } = args
  if (!device_id) return toolErr('device_id required')
  const { data: items, error } = await supabase.from('change_queue')
    .select('id, file_path, operation, hash')
    .eq('user_id', userId).eq('target_device', device_id).eq('delivered', false)
    .order('created_at', { ascending: true }).limit(50)
  if (error) return toolErr(error.message)
  if (!items?.length) return toolOk('No pending changes.')
  await supabase.from('change_queue')
    .update({ delivered: true, delivered_at: new Date().toISOString() })
    .in('id', items.map((i: {id: string}) => i.id))
  const lines = items.map((i: {operation: string; file_path: string}) => `${i.operation.padEnd(6)} ${i.file_path}`)
  return toolOk(`${items.length} change(s) marked delivered:\n${lines.join('\n')}`)
}

async function handleDeviceStatus(userId: string, _args: unknown, supabase: SupabaseClient) {
  const { data, error } = await supabase.from('devices')
    .select('id, name, hostname, platform, agent_version, last_seen_at')
    .eq('user_id', userId).order('last_seen_at', { ascending: false })
  if (error) return toolErr(error.message)
  if (!data?.length) return toolOk('No devices registered.')
  const now = Date.now()
  const lines = data.map((d: {name:string;platform:string;hostname:string;agent_version:string;last_seen_at:string;id:string}) => {
    const ago = Math.round((now - new Date(d.last_seen_at).getTime()) / 1000)
    const status = ago < 60 ? 'ONLINE' : ago < 300 ? 'RECENT' : 'OFFLINE'
    return `[${status}] ${d.name} (${d.platform}) ${d.hostname} v${d.agent_version} last:${ago}s id:${d.id}`
  })
  return toolOk(lines.join('\n'))
}

async function handleListSkills(_userId: string, args: Record<string,string>, supabase: SupabaseClient) {
  // deno-lint-ignore no-explicit-any
  let q: any = supabase.from('plugin_registry')
    .select('name, version, description, source, homepage_url, weekly_downloads')
  if (args.query) q = q.ilike('name', `%${args.query}%`)
  if (args.source) q = q.eq('source', args.source)
  const { data, error } = await q.order('weekly_downloads', { ascending: false }).limit(20)
  if (error) return toolErr(error.message)
  if (!data?.length) return toolOk('Registry empty — run refresh-plugins Edge Function to populate.')
  // deno-lint-ignore no-explicit-any
  const lines = data.map((p: any) => `${p.name}@${p.version} [${p.source}] ${p.description ?? ''} ${p.weekly_downloads ? `${p.weekly_downloads}/wk` : ''}`.trim())
  return toolOk(lines.join('\n'))
}

async function handleInstall(kind: 'skill'|'plugin', userId: string, args: Record<string,string>, supabase: SupabaseClient) {
  const { device_id, name } = args
  if (!device_id || !name) return toolErr('device_id and name required')
  const { data: entry } = await supabase.from('plugin_registry').select('*').eq('name', name).single()
  if (!entry) return toolErr(`"${name}" not in registry. Use list_skills to browse.`)

  let content = `# ${name}\n# Source: ${entry.source}\n# Version: ${entry.version}\n`
  if (entry.homepage_url) content += `# Homepage: ${entry.homepage_url}\n`
  if (entry.npm_package) content += `# Install: npm install -g ${entry.npm_package}\n`

  const filePath = kind === 'skill' ? `skills/${name}.md` : `plugins/${name}.json`
  const storagePath = `${userId}/${filePath}`
  const bytes = new TextEncoder().encode(content)
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
  const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')

  await supabase.storage.from('claude-env').upload(storagePath, bytes, { upsert: true, contentType: 'text/plain' })
  await supabase.from('sync_files').upsert({
    user_id: userId, path: filePath, hash, storage_path: storagePath,
    size_bytes: bytes.length, updated_by: device_id, updated_at: new Date().toISOString(), deleted: false,
  }, { onConflict: 'user_id,path' })
  const { data: others } = await supabase.from('devices').select('id').eq('user_id', userId).neq('id', device_id)
  if (others?.length) {
    await supabase.from('change_queue').insert(
      others.map((d: {id: string}) => ({ user_id: userId, target_device: d.id, file_path: filePath, operation: 'upsert', storage_path: storagePath, hash }))
    )
  }
  return toolOk(`Installed ${kind} "${name}" → ${filePath}. Syncing to ${others?.length ?? 0} device(s).`)
}

async function handleDiff(userId: string, args: Record<string,string>, supabase: SupabaseClient) {
  const { file_path, local_content } = args
  if (!file_path || local_content === undefined) return toolErr('file_path and local_content required')
  const { data: meta } = await supabase.from('sync_files')
    .select('storage_path, hash').eq('user_id', userId).eq('path', file_path).single()
  if (!meta) return toolOk(`${file_path} — not tracked in ClaudeSync`)
  const { data: blob, error } = await supabase.storage.from('claude-env').download(meta.storage_path)
  if (error) return toolErr(`Download failed: ${error.message}`)
  const remote = await blob.text()
  if (remote === local_content) return toolOk(`${file_path} — identical to remote (hash:${meta.hash.slice(0,12)}…)`)
  const localLines = local_content.split('\n')
  const remoteLines = remote.split('\n')
  const out: string[] = [`--- remote/${file_path}`, `+++ local/${file_path}`]
  let changes = 0
  for (let i = 0; i < Math.max(localLines.length, remoteLines.length); i++) {
    if (localLines[i] === remoteLines[i]) continue
    if (remoteLines[i] !== undefined) out.push(`-[${i+1}] ${remoteLines[i]}`)
    if (localLines[i] !== undefined) out.push(`+[${i+1}] ${localLines[i]}`)
    if (++changes >= 50) { out.push(`… (truncated)`); break }
  }
  return toolOk(out.join('\n'))
}

async function dispatchTool(userId: string, name: string, args: Record<string,string>, supabase: SupabaseClient) {
  switch (name) {
    case 'sync_push':      return handleSyncPush(userId, args, supabase)
    case 'sync_pull':      return handleSyncPull(userId, args, supabase)
    case 'device_status':  return handleDeviceStatus(userId, args, supabase)
    case 'list_skills':    return handleListSkills(userId, args, supabase)
    case 'install_skill':  return handleInstall('skill', userId, args, supabase)
    case 'install_plugin': return handleInstall('plugin', userId, args, supabase)
    case 'diff':           return handleDiff(userId, args, supabase)
    default:               return toolErr(`Unknown tool: ${name}`)
  }
}

serve(async (req) => {
  if (req.method === 'GET') return new Response('ClaudeSync MCP running', { status: 200 })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const { id, method, params } = body as { id: unknown; method: string; params: Record<string, unknown> }

  if (method?.startsWith('notifications/')) return new Response(null, { status: 204 })

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'claudesync', version: '1.0.0' },
    })
  }

  if (method === 'ping') {
    const userId = await resolveUser(req, supabase)
    if (!userId) return rpcErr(id, -32001, 'Unauthorized')
    return ok(id, {})
  }

  if (method === 'tools/list') {
    const userId = await resolveUser(req, supabase)
    if (!userId) return rpcErr(id, -32001, 'Unauthorized')
    return ok(id, { tools: TOOLS })
  }

  if (method === 'tools/call') {
    const userId = await resolveUser(req, supabase)
    if (!userId) return rpcErr(id, -32001, 'Unauthorized')
    const { name, arguments: args = {} } = params as { name: string; arguments: Record<string, string> }
    const result = await dispatchTool(userId, name, args ?? {}, supabase)
    return ok(id, result)
  }

  return rpcErr(id, -32601, `Method not found: ${method}`)
})
