import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:  { padding:'1.5rem 0' },
  h2:    { fontSize:'1.1rem', fontWeight:'600', color:'#fff', marginBottom:'1rem' },
  grid:  { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'0.75rem', marginBottom:'1.5rem' },
  stat:  { background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'1rem' },
  num:   { fontSize:'1.8rem', fontWeight:'700', color:'#a78bfa' },
  slbl:  { fontSize:'0.78rem', color:'#666', marginTop:'2px' },
  h3:    { fontSize:'0.95rem', fontWeight:'600', color:'#ccc', marginBottom:'0.75rem' },
  table: { width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' },
  th:    { textAlign:'left', color:'#555', padding:'0 0 0.5rem', borderBottom:'1px solid #1f1f1f', fontWeight:'500' },
  td:    { padding:'0.5rem 0', borderBottom:'1px solid #1a1a1a', color:'#aaa', verticalAlign:'top' },
  path:  { fontFamily:'monospace', color:'#e8e8e8' },
  op:    (op) => ({ fontSize:'0.7rem', padding:'2px 6px', borderRadius:'4px', background: op === 'upsert' ? '#14532d' : '#450a0a', color: op === 'upsert' ? '#4ade80' : '#f87171' }),
  empty: { color:'#555', fontSize:'0.85rem' },
  del:   { color:'#666', fontSize:'0.75rem' },
}

function ago(ts) {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`
  return `${Math.floor(sec/3600)}h ago`
}

export default function SyncPanel() {
  const [stats, setStats]   = useState({ files: 0, devices: 0, pending: 0, conflicts: 0 })
  const [recent, setRecent] = useState([])

  useEffect(() => {
    async function load() {
      const [filesRes, devRes, qRes, cfRes, recentRes] = await Promise.all([
        supabase.from('sync_files').select('id', { count:'exact' }).eq('deleted', false),
        supabase.from('devices').select('id', { count:'exact' }),
        supabase.from('change_queue').select('id', { count:'exact' }).eq('delivered', false),
        supabase.from('conflict_log').select('id', { count:'exact' }).eq('resolved', false),
        supabase.from('sync_files').select('path, updated_at, updated_by').eq('deleted', false).order('updated_at', { ascending: false }).limit(20),
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
              {recent.map(f => (
                <tr key={f.path}>
                  <td style={s.td}><span style={s.path}>{f.path}</span></td>
                  <td style={{ ...s.td, ...s.del }}>{ago(f.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
      }
    </div>
  )
}
