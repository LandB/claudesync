import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:      { padding:'1.5rem 0' },
  h2:        { fontSize:'1.1rem', fontWeight:'600', color:'#fff', marginBottom:'1rem' },
  grid:      { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'0.75rem', marginBottom:'1.5rem' },
  stat:      { background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'1rem' },
  num:       { fontSize:'1.8rem', fontWeight:'700', color:'#a78bfa' },
  slbl:      { fontSize:'0.78rem', color:'#666', marginTop:'2px' },
  h3:        { fontSize:'0.95rem', fontWeight:'600', color:'#ccc', marginBottom:'0.75rem' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' },
  th:        { textAlign:'left', color:'#555', padding:'0 0 0.5rem', borderBottom:'1px solid #1f1f1f', fontWeight:'500' },
  td:        { padding:'0.5rem 0', borderBottom:'1px solid #1a1a1a', color:'#aaa', verticalAlign:'top' },
  path:      { fontFamily:'monospace', color:'#e8e8e8' },
  empty:     { color:'#555', fontSize:'0.85rem' },
  del:       { color:'#666', fontSize:'0.75rem' },
  groupRow:  { cursor:'pointer', userSelect:'none' },
  groupPath: { fontFamily:'monospace', color:'#e8e8e8', display:'flex', alignItems:'center', gap:'0.4rem' },
  badge:     { fontSize:'0.68rem', padding:'1px 5px', borderRadius:'4px', background:'#252525', color:'#666', fontFamily:'monospace' },
  chevron:   { fontSize:'0.65rem', color:'#555', width:'10px', display:'inline-block' },
  dimPath:   { fontFamily:'monospace', color:'#888', fontSize:'0.8rem' },
}

function ago(ts) {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`
  return `${Math.floor(sec/3600)}h ago`
}

function buildTree(files) {
  const root = { children: new Map(), files: [], latest: null }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, path: parts.slice(0, i + 1).join('/'), children: new Map(), files: [], latest: null })
      }
      node = node.children.get(seg)
    }
    node.files.push(f)
  }
  function setLatest(node) {
    let t = null
    for (const f of node.files) if (!t || f.updated_at > t) t = f.updated_at
    for (const c of node.children.values()) { const ct = setLatest(c); if (!t || (ct && ct > t)) t = ct }
    node.latest = t
    return t
  }
  setLatest(root)
  return root
}

function countFiles(node) {
  let n = node.files.length
  for (const c of node.children.values()) n += countFiles(c)
  return n
}

function renderTree(node, depth, expanded, toggle) {
  const rows = []
  const indent = depth * 14

  const dirs = [...node.children.values()].sort((a, b) => (b.latest ?? '') > (a.latest ?? '') ? 1 : -1)
  const files = [...node.files].sort((a, b) => b.updated_at > a.updated_at ? 1 : -1)

  for (const dir of dirs) {
    const open = expanded.has(dir.path)
    rows.push(
      <tr key={dir.path} style={s.groupRow} onClick={() => toggle(dir.path)}>
        <td style={s.td}>
          <span style={{ ...s.groupPath, paddingLeft: indent }}>
            <span style={s.chevron}>{open ? '▾' : '▸'}</span>
            <span>{dir.name}/</span>
            <span style={s.badge}>{countFiles(dir)}</span>
          </span>
        </td>
        <td style={{ ...s.td, ...s.del }}>{ago(dir.latest)}</td>
      </tr>
    )
    if (open) rows.push(...renderTree(dir, depth + 1, expanded, toggle))
  }

  for (const f of files) {
    const name = depth > 0 ? f.path.split('/').pop() : f.path
    rows.push(
      <tr key={f.path}>
        <td style={{ ...s.td, paddingLeft: indent || undefined }}>
          <span style={depth > 0 ? s.dimPath : s.path}>{name}</span>
        </td>
        <td style={{ ...s.td, ...s.del }}>{ago(f.updated_at)}</td>
      </tr>
    )
  }

  return rows
}

export default function SyncPanel() {
  const [stats, setStats]       = useState({ files: 0, devices: 0, pending: 0, conflicts: 0 })
  const [recent, setRecent]     = useState([])
  const [expanded, setExpanded] = useState(new Set())

  useEffect(() => {
    async function load() {
      const [filesRes, devRes, qRes, cfRes, recentRes] = await Promise.all([
        supabase.from('sync_files').select('id', { count:'exact' }).eq('deleted', false),
        supabase.from('devices').select('id', { count:'exact' }),
        supabase.from('change_queue').select('id', { count:'exact' }).eq('delivered', false),
        supabase.from('conflict_log').select('id', { count:'exact' }).eq('resolved', false),
        supabase.from('sync_files').select('path, updated_at, updated_by').eq('deleted', false).order('updated_at', { ascending: false }).limit(50),
      ])
      setStats({
        files:     filesRes.count ?? 0,
        devices:   devRes.count ?? 0,
        pending:   qRes.count ?? 0,
        conflicts: cfRes.count ?? 0,
      })
      setRecent(recentRes.data ?? [])
    }
    load()
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [])

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const tree = buildTree(recent)

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>Overview</h2>
      <div style={s.grid}>
        {[
          { num: stats.files,     label: 'Synced files' },
          { num: stats.devices,   label: 'Devices' },
          { num: stats.pending,   label: 'Pending changes' },
          { num: stats.conflicts, label: 'Unresolved conflicts' },
        ].map(({ num, label }) => (
          <div key={label} style={s.stat}>
            <div style={s.num}>{num}</div>
            <div style={s.slbl}>{label}</div>
          </div>
        ))}
      </div>

      <h3 style={s.h3}>Recent activity</h3>
      {recent.length === 0
        ? <div style={s.empty}>No files synced yet.</div>
        : <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>File</th>
                <th style={s.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {renderTree(tree, 0, expanded, toggle)}
            </tbody>
          </table>
      }
    </div>
  )
}
