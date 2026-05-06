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
  childTd:   { padding:'0.3rem 0 0.3rem 1.4rem', borderBottom:'1px solid #161616', color:'#aaa', verticalAlign:'top' },
  childPath: { fontFamily:'monospace', color:'#888', fontSize:'0.8rem' },
}

function ago(ts) {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`
  return `${Math.floor(sec/3600)}h ago`
}

function groupFiles(files) {
  const groups = new Map()
  const standalone = []

  for (const f of files) {
    const parts = f.path.split('/')
    if (parts[0] === 'plugins' && parts.length > 2) {
      const key = `plugins/${parts[1]}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(f)
    } else {
      standalone.push({ type: 'file', file: f })
    }
  }

  const rows = []
  for (const [key, children] of groups) {
    const latest = children.reduce((a, b) => a.updated_at > b.updated_at ? a : b)
    rows.push({ type: 'group', key, children, latest })
  }
  for (const f of standalone) rows.push(f)

  rows.sort((a, b) => {
    const ta = a.type === 'group' ? a.latest.updated_at : a.file.updated_at
    const tb = b.type === 'group' ? b.latest.updated_at : b.file.updated_at
    return ta > tb ? -1 : 1
  })

  return rows
}

export default function SyncPanel() {
  const [stats, setStats]     = useState({ files: 0, devices: 0, pending: 0, conflicts: 0 })
  const [recent, setRecent]   = useState([])
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

  const rows = groupFiles(recent)

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
      {rows.length === 0
        ? <div style={s.empty}>No files synced yet.</div>
        : <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>File</th>
                <th style={s.th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                if (row.type === 'file') return (
                  <tr key={row.file.path}>
                    <td style={s.td}><span style={s.path}>{row.file.path}</span></td>
                    <td style={{ ...s.td, ...s.del }}>{ago(row.file.updated_at)}</td>
                  </tr>
                )

                const open = expanded.has(row.key)
                return [
                  <tr key={row.key} style={s.groupRow} onClick={() => toggle(row.key)}>
                    <td style={s.td}>
                      <span style={s.groupPath}>
                        <span style={s.chevron}>{open ? '▾' : '▸'}</span>
                        <span style={s.path}>{row.key}</span>
                        <span style={s.badge}>{row.children.length}</span>
                      </span>
                    </td>
                    <td style={{ ...s.td, ...s.del }}>{ago(row.latest.updated_at)}</td>
                  </tr>,
                  ...(open ? row.children.map(f => (
                    <tr key={f.path}>
                      <td style={s.childTd}>
                        <span style={s.childPath}>{f.path.split('/').slice(2).join('/')}</span>
                      </td>
                      <td style={{ ...s.childTd, ...s.del }}>{ago(f.updated_at)}</td>
                    </tr>
                  )) : [])
                ]
              })}
            </tbody>
          </table>
      }
    </div>
  )
}
