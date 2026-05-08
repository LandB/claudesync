import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:      { padding:'1.5rem 0' },
  h2:        { fontSize:'1.1rem', fontWeight:'600', color:'#fff', marginBottom:'1rem' },
  grid:      { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:'0.75rem', marginBottom:'1.5rem' },
  stat:      { background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'1rem', position:'relative' },
  num:       { fontSize:'1.8rem', fontWeight:'700', color:'#a78bfa' },
  slbl:      { fontSize:'0.78rem', color:'#666', marginTop:'2px' },
  infoBtn:   { position:'absolute', top:'0.6rem', right:'0.6rem', background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:'0.8rem', lineHeight:1, padding:'2px 5px', borderRadius:'4px' },
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
  overlay:   { position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:     { background:'#141414', border:'1px solid #2a2a2a', borderRadius:'10px', padding:'1.5rem', width:'min(560px,90vw)', maxHeight:'80vh', display:'flex', flexDirection:'column', gap:'1rem' },
  mhead:     { display:'flex', alignItems:'center', justifyContent:'space-between' },
  mtitle:    { fontSize:'1rem', fontWeight:'600', color:'#fff' },
  mclose:    { background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:'1.1rem', lineHeight:1 },
  mexplain:  { fontSize:'0.83rem', color:'#888', lineHeight:'1.6', background:'#1a1a1a', border:'1px solid #252525', borderRadius:'6px', padding:'0.75rem' },
  mscroll:   { overflowY:'auto', flex:1 },
  mop:       (op) => ({ fontSize:'0.68rem', padding:'1px 6px', borderRadius:'4px', fontFamily:'monospace', background: op==='delete' ? '#2d1212' : '#12202d', color: op==='delete' ? '#f87171' : '#60a5fa' }),
  mdev:      { fontSize:'0.75rem', color:'#555', fontFamily:'monospace' },
  warn:      { fontSize:'0.8rem', color:'#fb923c', background:'#1c1007', border:'1px solid #78350f', borderRadius:'6px', padding:'0.6rem 0.75rem' },
  ccard:     { background:'#1a1a1a', border:'1px solid #3f1515', borderRadius:'8px', padding:'0.85rem', marginBottom:'0.5rem' },
  cpath:     { fontFamily:'monospace', color:'#f87171', fontSize:'0.85rem', fontWeight:'600', marginBottom:'0.4rem' },
  crow:      { display:'flex', gap:'1rem', marginBottom:'0.4rem', flexWrap:'wrap' },
  ccol:      { flex:1, minWidth:'120px' },
  clabel:    { fontSize:'0.68rem', color:'#555', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'2px' },
  cval:      { fontSize:'0.78rem', color:'#aaa', fontFamily:'monospace' },
  resolveBtn:(disabled) => ({ marginTop:'0.5rem', padding:'4px 12px', borderRadius:'6px', fontSize:'0.78rem', cursor: disabled ? 'not-allowed' : 'pointer', background:'none', border:'1px solid #333', color: disabled ? '#444' : '#aaa', opacity: disabled ? 0.5 : 1 }),
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

function PendingModal({ onClose }) {
  const [items, setItems] = useState(null)
  const [devices, setDevices] = useState({})

  useEffect(() => {
    async function load() {
      const [qRes, devRes] = await Promise.all([
        supabase.from('change_queue').select('file_path, operation, target_device, created_at')
          .eq('delivered', false).order('created_at', { ascending: false }).limit(100),
        supabase.from('devices').select('id, name'),
      ])
      setItems(qRes.data ?? [])
      const map = {}
      for (const d of devRes.data ?? []) map[d.id] = d.name
      setDevices(map)
    }
    load()
  }, [])

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.mhead}>
          <span style={s.mtitle}>Pending changes</span>
          <button style={s.mclose} onClick={onClose}>✕</button>
        </div>
        <div style={s.mexplain}>
          When a file changes on one device, ClaudeSync queues a delivery to every other registered device. <strong style={{ color:'#ccc' }}>Pending changes</strong> are queued deliveries that haven't been picked up yet — usually because the target device is offline. The count drops to zero once all devices sync.
        </div>
        <div style={s.mscroll}>
          {items === null && <div style={s.empty}>Loading…</div>}
          {items?.length === 0 && <div style={s.empty}>No pending changes.</div>}
          {items?.length > 0 &&
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>File</th>
                  <th style={s.th}>Op</th>
                  <th style={s.th}>Target device</th>
                  <th style={s.th}>Queued</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td style={s.td}><span style={s.dimPath}>{item.file_path}</span></td>
                    <td style={s.td}><span style={s.mop(item.operation)}>{item.operation}</span></td>
                    <td style={s.td}><span style={s.mdev}>{devices[item.target_device] ?? item.target_device?.slice(0, 8)}</span></td>
                    <td style={{ ...s.td, ...s.del }}>{ago(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      </div>
    </div>
  )
}

function ConflictModal({ pending, onClose }) {
  const [conflicts, setConflicts] = useState(null)
  const [devices, setDevices] = useState({})

  async function load() {
    const [cfRes, devRes] = await Promise.all([
      supabase.from('conflict_log').select('*').eq('resolved', false).order('created_at', { ascending: false }).limit(100),
      supabase.from('devices').select('id, name'),
    ])
    setConflicts(cfRes.data ?? [])
    const map = {}
    for (const d of devRes.data ?? []) map[d.id] = d.name
    setDevices(map)
  }

  useEffect(() => { load() }, [])

  async function resolve(id) {
    if (pending > 0) return
    await supabase.from('conflict_log').update({ resolved: true }).eq('id', id)
    setConflicts(cs => cs.filter(c => c.id !== id))
  }

  async function resolveAll() {
    if (pending > 0 || !conflicts?.length) return
    const ids = conflicts.map(c => c.id)
    await supabase.from('conflict_log').update({ resolved: true }).in('id', ids)
    setConflicts([])
  }

  function truncate(str, n = 12) { return str ? str.slice(0, n) + '…' : '—' }

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.mhead}>
          <span style={s.mtitle}>Unresolved conflicts</span>
          <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
            {conflicts?.length > 0 &&
              <button style={s.resolveBtn(pending > 0)} onClick={resolveAll} disabled={pending > 0}>
                Resolve all
              </button>
            }
            <button style={s.mclose} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={s.mexplain}>
          A <strong style={{ color:'#ccc' }}>conflict</strong> happens when the same file is modified on two devices before either syncs. ClaudeSync keeps the most recent version (winner) and discards the other (loser). Mark a conflict resolved once you've verified the right version won.
        </div>
        {pending > 0 &&
          <div style={s.warn}>
            {pending} pending change{pending > 1 ? 's' : ''} still in queue — wait for them to deliver before resolving conflicts to avoid re-triggering them.
          </div>
        }
        <div style={s.mscroll}>
          {conflicts === null && <div style={s.empty}>Loading…</div>}
          {conflicts?.length === 0 && <div style={s.empty}>No unresolved conflicts.</div>}
          {conflicts?.map(c => (
            <div key={c.id} style={s.ccard}>
              <div style={s.cpath}>{c.file_path}</div>
              <div style={s.crow}>
                <div style={s.ccol}>
                  <div style={s.clabel}>Winner (kept)</div>
                  <div style={s.cval}>{devices[c.winning_device] ?? truncate(c.winning_device)}</div>
                  <div style={{ ...s.cval, color:'#555' }}>hash: {truncate(c.winning_hash)}</div>
                </div>
                <div style={s.ccol}>
                  <div style={s.clabel}>Loser (discarded)</div>
                  <div style={s.cval}>{devices[c.losing_device] ?? truncate(c.losing_device)}</div>
                  <div style={{ ...s.cval, color:'#555' }}>hash: {truncate(c.losing_hash)}</div>
                </div>
              </div>
              <div style={{ ...s.del, marginTop:'4px' }}>{ago(c.created_at)}</div>
              <button style={s.resolveBtn(pending > 0)} onClick={() => resolve(c.id)} disabled={pending > 0}>
                Mark resolved
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SyncPanel() {
  const [stats, setStats]       = useState({ files: 0, devices: 0, conflicts: 0 })
  const [recent, setRecent]     = useState([])
  const [expanded, setExpanded] = useState(new Set())
  const [showConflicts, setShowConflicts] = useState(false)

  useEffect(() => {
    async function load() {
      const [filesRes, devRes, cfRes, recentRes] = await Promise.all([
        supabase.from('sync_files').select('id', { count:'exact' }).eq('deleted', false),
        supabase.from('devices').select('id', { count:'exact' }),
        supabase.from('conflict_log').select('id', { count:'exact' }).eq('resolved', false),
        supabase.from('sync_files').select('path, updated_at, updated_by').eq('deleted', false).order('updated_at', { ascending: false }).limit(50),
      ])
      setStats({
        files:     filesRes.count ?? 0,
        devices:   devRes.count ?? 0,
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
          { num: stats.files,   label: 'Synced files' },
          { num: stats.devices, label: 'Devices' },
        ].map(({ num, label }) => (
          <div key={label} style={s.stat}>
            <div style={s.num}>{num}</div>
            <div style={s.slbl}>{label}</div>
          </div>
        ))}
        <div style={s.stat}>
          <div style={s.num}>{stats.conflicts}</div>
          <div style={s.slbl}>Unresolved conflicts</div>
          <button style={s.infoBtn} onClick={() => setShowConflicts(true)} title="View conflicts">ℹ</button>
        </div>
      </div>

      {showConflicts && <ConflictModal pending={0} onClose={() => setShowConflicts(false)} />}

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
