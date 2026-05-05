import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:     { padding:'1.5rem 0' },
  h2:       { fontSize:'1.1rem', fontWeight:'600', color:'#fff', marginBottom:'1rem' },
  toolbar:  { display:'flex', gap:'0.5rem', marginBottom:'1.25rem', flexWrap:'wrap' },
  search:   { flex:1, minWidth:'180px', background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'6px', color:'#e8e8e8', padding:'7px 12px', fontSize:'0.85rem', outline:'none' },
  filter:   { background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'6px', color:'#e8e8e8', padding:'7px 10px', fontSize:'0.85rem', cursor:'pointer' },
  refresh:  { background:'none', border:'1px solid #333', color:'#aaa', padding:'7px 12px', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' },
  tabs:     { display:'flex', gap:'0.25rem', marginBottom:'1.25rem', borderBottom:'1px solid #1a1a1a', paddingBottom:'0' },
  tab:      (a) => ({ background:'none', border:'none', borderBottom: a ? '2px solid #7c3aed' : '2px solid transparent', color: a ? '#a78bfa' : '#555', padding:'6px 14px', cursor:'pointer', fontSize:'0.87rem', marginBottom:'-1px' }),
  grid:     { display:'flex', flexDirection:'column', gap:'0.5rem' },
  card:     { background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'1rem', display:'flex', alignItems:'flex-start', gap:'0.75rem' },
  info:     { flex:1, minWidth:0 },
  name:     { fontWeight:'600', color:'#e8e8e8', fontSize:'0.9rem', fontFamily:'monospace' },
  desc:     { color:'#666', fontSize:'0.8rem', marginTop:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' },
  meta:     { display:'flex', gap:'0.5rem', marginTop:'6px', flexWrap:'wrap' },
  badge:    (src) => ({ fontSize:'0.7rem', padding:'2px 7px', borderRadius:'4px', background: src==='npm' ? '#1e3a5f' : src==='awesome-mcp' ? '#2d1f4e' : '#1a2e1a', color: src==='npm' ? '#60a5fa' : src==='awesome-mcp' ? '#c4b5fd' : '#4ade80' }),
  dl:       { fontSize:'0.75rem', color:'#444' },
  btn:      (installed) => ({ flexShrink:0, padding:'5px 14px', borderRadius:'6px', fontSize:'0.8rem', cursor:'pointer', border:'none', background: installed ? '#1a1a1a' : '#7c3aed', color: installed ? '#555' : '#fff', border: installed ? '1px solid #2a2a2a' : 'none' }),
  empty:    { color:'#555', fontSize:'0.85rem', padding:'2rem 0' },
  devsel:   { background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'6px', color:'#e8e8e8', padding:'7px 10px', fontSize:'0.85rem', cursor:'pointer' },
  insthead: { display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' },
}

export default function PluginManager() {
  const [tab, setTab]         = useState('browse')
  const [plugins, setPlugins] = useState([])
  const [installed, setInstalled] = useState([])
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [query, setQuery]     = useState('')
  const [source, setSource]   = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus]   = useState({})  // name -> 'installing' | 'done' | 'error'

  useEffect(() => {
    supabase.from('devices').select('id, name').then(({ data }) => {
      setDevices(data ?? [])
      if (data?.length) setDeviceId(data[0].id)
    })
    loadInstalled()
  }, [])

  useEffect(() => {
    if (tab === 'browse') search()
  }, [tab, query, source])

  async function search() {
    setLoading(true)
    let q = supabase.from('plugin_registry')
      .select('name, version, description, source, homepage_url, weekly_downloads, npm_package')
    if (query) q = q.ilike('name', `%${query}%`)
    if (source) q = q.eq('source', source)
    const { data } = await q.order('weekly_downloads', { ascending: false }).limit(50)
    setPlugins(data ?? [])
    setLoading(false)
  }

  async function loadInstalled() {
    const { data } = await supabase.from('sync_files')
      .select('path, updated_at, size_bytes')
      .eq('deleted', false)
      .or('path.like.skills/%,path.like.plugins/%')
      .order('updated_at', { ascending: false })
    setInstalled(data ?? [])
  }

  async function install(plugin) {
    if (!deviceId) return
    setStatus(s => ({ ...s, [plugin.name]: 'installing' }))
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const content = [
        `# ${plugin.name}`,
        `# Version: ${plugin.version}`,
        `# Source: ${plugin.source}`,
        plugin.homepage_url ? `# Homepage: ${plugin.homepage_url}` : null,
        plugin.npm_package   ? `# Install: npm install -g ${plugin.npm_package}` : null,
        plugin.description   ? `\n${plugin.description}` : null,
      ].filter(Boolean).join('\n')

      const isPlugin = plugin.source === 'npm' && plugin.npm_package
      const filePath = isPlugin ? `plugins/${plugin.name}.json` : `skills/${plugin.name}.md`
      const storagePath = `${user.id}/${filePath}`
      const bytes = new TextEncoder().encode(content)
      const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
      const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')

      await supabase.storage.from('claude-env').upload(storagePath, bytes, { upsert: true, contentType: 'text/plain' })
      await supabase.from('sync_files').upsert({
        user_id: user.id, path: filePath, hash, storage_path: storagePath,
        size_bytes: bytes.length, updated_by: deviceId, updated_at: new Date().toISOString(), deleted: false,
      }, { onConflict: 'user_id,path' })

      const { data: otherDevices } = await supabase.from('devices').select('id').neq('id', deviceId)
      if (otherDevices?.length) {
        await supabase.from('change_queue').insert(
          otherDevices.map(d => ({ user_id: user.id, target_device: d.id, file_path: filePath, operation: 'upsert', storage_path: storagePath, hash }))
        )
      }
      setStatus(s => ({ ...s, [plugin.name]: 'done' }))
      await loadInstalled()
    } catch (e) {
      setStatus(s => ({ ...s, [plugin.name]: 'error:' + e.message }))
    }
  }

  async function uninstall(filePath) {
    const { data: { user } } = await supabase.auth.getUser()
    const storagePath = `${user.id}/${filePath}`
    await supabase.storage.from('claude-env').remove([storagePath])
    await supabase.from('sync_files').update({ deleted: true, updated_at: new Date().toISOString() })
      .eq('user_id', user.id).eq('path', filePath)
    await loadInstalled()
  }

  const installedPaths = new Set(installed.map(i => i.path))
  const isInstalled = (p) => installedPaths.has(`plugins/${p.name}.json`) || installedPaths.has(`skills/${p.name}.md`)

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>Plugins & Skills</h2>

      <div style={s.tabs}>
        <button style={s.tab(tab==='browse')} onClick={() => setTab('browse')}>Browse registry</button>
        <button style={s.tab(tab==='installed')} onClick={() => { setTab('installed'); loadInstalled() }}>
          Installed ({installed.length})
        </button>
      </div>

      {tab === 'browse' && <>
        <div style={s.toolbar}>
          <input style={s.search} placeholder="Search plugins…" value={query} onChange={e => setQuery(e.target.value)} />
          <select style={s.filter} value={source} onChange={e => setSource(e.target.value)}>
            <option value="">All sources</option>
            <option value="npm">npm</option>
            <option value="awesome-mcp">awesome-mcp</option>
            <option value="manual">manual</option>
          </select>
          <select style={s.devsel} value={deviceId} onChange={e => setDeviceId(e.target.value)}>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button style={s.refresh} onClick={() =>
            fetch('https://pkiufpjrwcdvvcpxdubf.supabase.co/functions/v1/refresh-plugins', { method:'POST' })
              .then(() => search())
          }>↻ Refresh registry</button>
        </div>

        {loading && <div style={s.empty}>Loading…</div>}
        {!loading && plugins.length === 0 && <div style={s.empty}>No results.</div>}
        <div style={s.grid}>
          {plugins.map(p => {
            const st = status[p.name]
            const inst = isInstalled(p)
            return (
              <div key={p.name} style={s.card}>
                <div style={s.info}>
                  <div style={s.name}>{p.name}</div>
                  {p.description && <div style={s.desc}>{p.description}</div>}
                  <div style={s.meta}>
                    <span style={s.badge(p.source)}>{p.source}</span>
                    <span style={s.dl}>v{p.version}</span>
                    {p.weekly_downloads > 0 && <span style={s.dl}>↓ {p.weekly_downloads.toLocaleString()}/wk</span>}
                  </div>
                </div>
                <button style={s.btn(inst || st === 'done')}
                  onClick={() => !inst && st !== 'installing' && install(p)}
                  disabled={inst || st === 'installing'}>
                  {st === 'installing' ? '…' : inst || st === 'done' ? '✓ Installed' : 'Install'}
                </button>
              </div>
            )
          })}
        </div>
      </>}

      {tab === 'installed' && <>
        <div style={s.insthead}>
          <span style={{ color:'#666', fontSize:'0.85rem' }}>{installed.length} file(s) in skills/ and plugins/</span>
        </div>
        {installed.length === 0 && <div style={s.empty}>Nothing installed yet.</div>}
        <div style={s.grid}>
          {installed.map(f => (
            <div key={f.path} style={s.card}>
              <div style={s.info}>
                <div style={s.name}>{f.path}</div>
                <div style={s.desc}>{(f.size_bytes / 1024).toFixed(1)} KB · updated {new Date(f.updated_at).toLocaleDateString()}</div>
              </div>
              <button style={{ ...s.btn(false), background:'none', border:'1px solid #3f0000', color:'#f87171' }}
                onClick={() => uninstall(f.path)}>Remove</button>
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}
