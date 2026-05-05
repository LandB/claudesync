import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:    { padding:'1.5rem 0' },
  head:    { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' },
  h2:      { fontSize:'1.1rem', fontWeight:'600', color:'#fff' },
  refresh: { background:'none', border:'1px solid #333', color:'#aaa', padding:'4px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' },
  empty:   { color:'#555', fontSize:'0.85rem', padding:'2rem 0' },
  card:    { background:'#1a1a1a', border:'1px solid #3f1515', borderRadius:'8px', padding:'1rem', marginBottom:'0.75rem' },
  resolved:{ background:'#111', border:'1px solid #1a2e1a', borderRadius:'8px', padding:'1rem', marginBottom:'0.75rem', opacity:0.6 },
  path:    { fontFamily:'monospace', fontWeight:'600', color:'#f87171', fontSize:'0.9rem', marginBottom:'0.5rem' },
  rpathok: { fontFamily:'monospace', fontWeight:'600', color:'#4ade80', fontSize:'0.9rem', marginBottom:'0.5rem' },
  row:     { display:'flex', gap:'1rem', marginBottom:'0.5rem', flexWrap:'wrap' },
  col:     { flex:1, minWidth:'140px' },
  label:   { fontSize:'0.7rem', color:'#555', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'3px' },
  val:     { fontSize:'0.8rem', color:'#aaa', fontFamily:'monospace', wordBreak:'break-all' },
  time:    { fontSize:'0.75rem', color:'#444', marginTop:'0.5rem' },
  foot:    { display:'flex', gap:'0.5rem', marginTop:'0.75rem' },
  btn:     { padding:'5px 14px', borderRadius:'6px', fontSize:'0.8rem', cursor:'pointer', background:'none', border:'1px solid #333', color:'#aaa' },
  badge:   (ok) => ({ fontSize:'0.7rem', padding:'2px 7px', borderRadius:'4px', display:'inline-block', background: ok ? '#14532d' : '#450a0a', color: ok ? '#4ade80' : '#f87171', marginLeft:'0.5rem' }),
}

function truncate(s, n=16) { return s ? s.slice(0,n) + '…' : '—' }
function ago(ts) {
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec/60)}m ago`
  if (sec < 86400) return `${Math.floor(sec/3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

export default function ConflictLog() {
  const [conflicts, setConflicts] = useState([])
  const [devices, setDevices]     = useState({})
  const [loading, setLoading]     = useState(true)
  const [showResolved, setShowResolved] = useState(false)

  async function load() {
    setLoading(true)
    const [cfRes, devRes] = await Promise.all([
      supabase.from('conflict_log').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('devices').select('id, name, hostname'),
    ])
    setConflicts(cfRes.data ?? [])
    const devMap = {}
    for (const d of devRes.data ?? []) devMap[d.id] = `${d.name} (${d.hostname})`
    setDevices(devMap)
    setLoading(false)
  }

  async function resolve(id) {
    await supabase.from('conflict_log').update({ resolved: true }).eq('id', id)
    setConflicts(cs => cs.map(c => c.id === id ? { ...c, resolved: true } : c))
  }

  async function resolveAll() {
    const ids = conflicts.filter(c => !c.resolved).map(c => c.id)
    if (!ids.length) return
    await supabase.from('conflict_log').update({ resolved: true }).in('id', ids)
    setConflicts(cs => cs.map(c => ({ ...c, resolved: true })))
  }

  useEffect(() => { load() }, [])

  const visible = conflicts.filter(c => showResolved || !c.resolved)
  const unresolved = conflicts.filter(c => !c.resolved).length

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>
          Conflicts
          {unresolved > 0 && <span style={s.badge(false)}>{unresolved} unresolved</span>}
          {unresolved === 0 && conflicts.length > 0 && <span style={s.badge(true)}>all clear</span>}
        </h2>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          {unresolved > 0 && <button style={s.btn} onClick={resolveAll}>Resolve all</button>}
          <button style={s.btn} onClick={() => setShowResolved(v => !v)}>
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
          <button style={s.btn} onClick={load}>↻</button>
        </div>
      </div>

      {loading && <div style={s.empty}>Loading…</div>}
      {!loading && visible.length === 0 && (
        <div style={s.empty}>
          {conflicts.length === 0
            ? 'No conflicts recorded. Good sync hygiene!'
            : 'No unresolved conflicts.'}
        </div>
      )}

      {visible.map(c => (
        <div key={c.id} style={c.resolved ? s.resolved : s.card}>
          <div style={c.resolved ? s.rpathok : s.path}>
            {c.file_path}
            {c.resolved && <span style={s.badge(true)}>resolved</span>}
          </div>
          <div style={s.row}>
            <div style={s.col}>
              <div style={s.label}>Winner (kept)</div>
              <div style={s.val}>{devices[c.winning_device] ?? c.winning_device?.slice(0,8)}</div>
              <div style={{ ...s.val, color:'#666' }}>hash: {truncate(c.winning_hash)}</div>
            </div>
            <div style={s.col}>
              <div style={s.label}>Loser (discarded)</div>
              <div style={s.val}>{devices[c.losing_device] ?? c.losing_device?.slice(0,8)}</div>
              <div style={{ ...s.val, color:'#666' }}>hash: {truncate(c.losing_hash)}</div>
            </div>
          </div>
          <div style={s.time}>{ago(c.created_at)}</div>
          {!c.resolved && (
            <div style={s.foot}>
              <button style={s.btn} onClick={() => resolve(c.id)}>Mark resolved</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
