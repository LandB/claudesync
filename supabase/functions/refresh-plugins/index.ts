import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Fetch top Claude/MCP-related npm packages
async function fetchNpm(): Promise<unknown[]> {
  const queries = ['mcp-server', 'claude-mcp', 'model-context-protocol']
  const results: unknown[] = []
  for (const q of queries) {
    try {
      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${q}&size=50`,
        { headers: { 'Accept': 'application/json' } }
      )
      const data = await res.json()
      for (const obj of data.objects ?? []) {
        const p = obj.package
        results.push({
          name: p.name,
          version: p.version,
          description: p.description ?? null,
          source: 'npm',
          homepage_url: p.links?.homepage ?? p.links?.npm ?? null,
          npm_package: p.name,
          weekly_downloads: obj.downloads?.weekly ?? 0,
          last_fetched_at: new Date().toISOString(),
        })
      }
    } catch (e) {
      console.warn(`npm fetch failed for "${q}":`, e.message)
    }
  }
  return results
}

// Fetch awesome-mcp-servers README and parse package names
async function fetchAwesomeMcp(): Promise<unknown[]> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/main/README.md'
    )
    const text = await res.text()
    const results: unknown[] = []
    // Extract lines with npm package refs: `npx -y @foo/bar` or `npm install @foo/bar`
    const npmRe = /(?:npx -y |npm install |npm i )(@?[\w@/.-]+)/g
    const seen = new Set()
    let m: RegExpExecArray | null
    while ((m = npmRe.exec(text)) !== null) {
      const pkg = m[1].trim()
      if (seen.has(pkg) || pkg.length < 3) continue
      seen.add(pkg)
      // Extract surrounding line for description
      const lineStart = text.lastIndexOf('\n', m.index) + 1
      const lineEnd = text.indexOf('\n', m.index)
      const line = text.slice(lineStart, lineEnd > 0 ? lineEnd : undefined).trim()
      const desc = line.replace(/[#*`\[\]]/g, '').replace(/https?:\/\/\S+/g, '').trim().slice(0, 120)
      results.push({
        name: pkg,
        version: 'latest',
        description: desc || null,
        source: 'awesome-mcp',
        homepage_url: null,
        npm_package: pkg,
        weekly_downloads: 0,
        last_fetched_at: new Date().toISOString(),
      })
    }
    return results
  } catch (e) {
    console.warn('awesome-mcp fetch failed:', e.message)
    return []
  }
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  console.log('Fetching npm packages...')
  const npmEntries = await fetchNpm()
  console.log(`npm: ${npmEntries.length} entries`)

  console.log('Fetching awesome-mcp-servers...')
  const awesomeEntries = await fetchAwesomeMcp()
  console.log(`awesome-mcp: ${awesomeEntries.length} entries`)

  const all = [...npmEntries, ...awesomeEntries]

  // Deduplicate by name (npm wins over awesome-mcp for same package)
  const deduped = Object.values(
    Object.fromEntries(all.map(e => [(e as {name:string}).name, e]))
  )

  if (deduped.length === 0) {
    return Response.json({ ok: true, upserted: 0, message: 'No entries fetched' })
  }

  const { error } = await supabase
    .from('plugin_registry')
    .upsert(deduped, { onConflict: 'name' })

  if (error) {
    console.error('Upsert error:', error)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  console.log(`Upserted ${deduped.length} entries`)
  return Response.json({ ok: true, upserted: deduped.length })
})
