import { useEffect, useState } from 'react'
import { LuSearch, LuDownload, LuRotateCcw, LuX, LuCheck, LuChevronDown, LuChevronRight, LuUpload, LuRefreshCw } from 'react-icons/lu'
import { supabase } from '../supabase'

const s = {
  wrap:        { padding: '1.5rem 0' },
  head:        { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' },
  h2:          { fontSize:'1.1rem', fontWeight:'600', color:'#fff' },
  refresh:     { background:'none', border:'1px solid #333', color:'#aaa', padding:'4px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' },
  empty:       { color:'#555', fontSize:'0.9rem' },
  device:      { background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'1rem', marginBottom:'0.75rem' },
  deviceTop:   { display:'flex', alignItems:'flex-start', gap:'1rem' },
  dot:         (online) => ({ width:8, height:8, borderRadius:'50%', background: online ? '#22c55e' : '#3f3f3f', marginTop:6, flexShrink:0 }),
  name:        { fontWeight:'600', color:'#fff', fontSize:'0.95rem' },
  meta:        { color:'#666', fontSize:'0.8rem', marginTop:'2px', lineHeight:'1.6' },
  del:         { marginLeft:'auto', background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:'1.1rem', padding:'4px 8px', borderRadius:'4px' },
  actions:     { display:'flex', gap:'0.4rem', flexWrap:'wrap', marginTop:'0.5rem' },
  btnDiscover: { background:'#12202d', border:'1px solid #1e4976', color:'#60a5fa', cursor:'pointer', fontSize:'0.75rem', padding:'3px 10px', borderRadius:'4px' },
  btnBusy:     { background:'#1a1a1a', border:'1px solid #333', color:'#555', fontSize:'0.75rem', padding:'3px 10px', borderRadius:'4px', cursor:'default' },
  btnSync:     { background:'#0f2d1a', border:'1px solid #166534', color:'#4ade80', cursor:'pointer', fontSize:'0.75rem', padding:'3px 10px', borderRadius:'4px' },
  btnRestart:  { background:'#1a1a0a', border:'1px solid #4a3f00', color:'#facc15', cursor:'pointer', fontSize:'0.75rem', padding:'3px 10px', borderRadius:'4px' },
  btnSnapshot: { background:'#1a0f2e', border:'1px solid #4c1d95', color:'#a78bfa', cursor:'pointer', fontSize:'0.75rem', padding:'3px 10px', borderRadius:'4px' },
  pending:     { marginTop:'0.75rem', borderTop:'1px solid #252525', paddingTop:'0.75rem' },
  pendingHead: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem' },
  pendingLbl:  { fontSize:'0.8rem', color:'#aaa', fontWeight:'500' },
  badge:       (n) => ({ fontSize:'0.7rem', padding:'1px 7px', borderRadius:'10px', background: n > 0 ? '#1e3a1e' : '#1a1a1a', color: n > 0 ? '#4ade80' : '#555', marginLeft:'0.4rem' }),
  notChecked:  { fontSize:'0.75rem', color:'#555', fontStyle:'italic' },
  upToDate:    { fontSize:'0.75rem', color:'#22c55e' },
  table:       { width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' },
  td:          { padding:'3px 0', borderBottom:'1px solid #1a1a1a', verticalAlign:'middle' },
  groupRow:    { cursor:'pointer', userSelect:'none' },
  groupPath:   { fontFamily:'monospace', color:'#e8e8e8', display:'flex', alignItems:'center', gap:'0.4rem' },
  treeBadge:   { fontSize:'0.68rem', padding:'1px 5px', borderRadius:'4px', background:'#252525', color:'#666', fontFamily:'monospace' },
  chevron:     { fontSize:'0.65rem', color:'#555', width:'10px', display:'inline-block' },
  dimPath:     { fontFamily:'monospace', color:'#888', fontSize:'0.8rem' },
  fileStatus:  (isNew) => ({ fontSize:'0.68rem', padding:'1px 5px', borderRadius:'4px', background: isNew ? '#12202d' : '#1c1209', color: isNew ? '#60a5fa' : '#fb923c' }),
  checkbox:    { accentColor:'#a78bfa', cursor:'pointer', marginRight:'4px' },
  syncBar:     { display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'0.5rem' },
  selectAll:   { fontSize:'0.75rem', color:'#666', cursor:'pointer', background:'none', border:'none', padding:0 },
}

function ago(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

function buildDiffTree(files) {
  const root = { children: new Map(), files: [] }
  for (const f of files) {
    const parts = f.file_path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.children.has(seg)) {
        node.children.set(seg, { name: seg, path: parts.slice(0, i + 1).join('/'), children: new Map(), files: [] })
      }
      node = node.children.get(seg)
    }
    node.files.push(f)
  }
  return root
}

function collectPaths(node) {
  const paths = node.files.map(f => f.file_path)
  for (const c of node.children.values()) paths.push(...collectPaths(c))
  return paths
}

function countDiffs(node) {
  let n = node.files.length
  for (const c of node.children.values()) n += countDiffs(c)
  return n
}

function renderDiffTree(node, depth, expanded, toggle, selected, onTogglePath, onToggleDir) {
  const rows = []
  const indent = depth * 14

  for (const dir of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const open = expanded.has(dir.path)
    const dirPaths = collectPaths(dir)
    const allSelected = dirPaths.length > 0 && dirPaths.every(p => selected.has(p))
    const someSelected = dirPaths.some(p => selected.has(p))
    rows.push(
      <tr key={dir.path} style={s.groupRow}>
        <td style={s.td}>
          <span style={{ ...s.groupPath, paddingLeft: indent }}>
            <input type="checkbox" style={s.checkbox}
              checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={() => onToggleDir(dirPaths, allSelected)}
              onClick={e => e.stopPropagation()}
            />
            <span onClick={() => toggle(dir.path)}>
              <span style={s.chevron}>{open ? <LuChevronDown size={11} /> : <LuChevronRight size={11} />}</span>
              <span>{dir.name}/</span>
              <span style={s.treeBadge}>{countDiffs(dir)}</span>
            </span>
          </span>
        </td>
        <td style={{ ...s.td, textAlign:'right' }} onClick={() => toggle(dir.path)} />
      </tr>
    )
    if (open) rows.push(...renderDiffTree(dir, depth + 1, expanded, toggle, selected, onTogglePath, onToggleDir))
  }

  for (const f of [...node.files].sort((a, b) => a.file_path.localeCompare(b.file_path))) {
    const name = depth > 0 ? f.file_path.split('/').pop() : f.file_path
    rows.push(
      <tr key={f.file_path}>
        <td style={{ ...s.td, paddingLeft: indent || undefined }}>
          <span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
            <input type="checkbox" style={s.checkbox}
              checked={selected.has(f.file_path)}
              onChange={() => onTogglePath(f.file_path)}
            />
            <span style={depth > 0 ? s.dimPath : { fontFamily:'monospace', fontSize:'0.78rem', color:'#e8e8e8' }}>{name}</span>
          </span>
        </td>
        <td style={{ ...s.td, textAlign:'right' }}>
          <span style={s.fileStatus(!f.server_hash)}>{f.server_hash ? 'modified' : 'new'}</span>
        </td>
      </tr>
    )
  }
  return rows
}

function PendingPanel({ device, onSyncDone }) {
  const [diffs, setDiffs] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [expanded, setExpanded] = useState(new Set())
  const [syncing, setSyncing] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('discovery_results')
      .select('file_path, local_hash, server_hash')
      .eq('device_id', device.id)
      .order('file_path')
    const items = data ?? []
    setDiffs(items)
    setSelected(new Set(items.map(d => d.file_path)))
  }

  useEffect(() => {
    load()
  }, [device.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function togglePath(path) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  function toggleDir(paths, allSelected) {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) paths.forEach(p => next.delete(p))
      else paths.forEach(p => next.add(p))
      return next
    })
  }

  function toggleExpanded(path) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === diffs.length) setSelected(new Set())
    else setSelected(new Set(diffs.map(d => d.file_path)))
  }

  async function sync() {
    if (!selected.size) return
    setSyncing(true)
    await new Promise((resolve) => {
      const ch = supabase.channel(`device:${device.id}`)
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({ type: 'broadcast', event: 'sync', payload: { files: [...selected] } })
            .finally(() => { supabase.removeChannel(ch); resolve() })
        }
      })
    })
    // Clear local state optimistically — agent will call sync-complete
    setDiffs([])
    setSelected(new Set())
    setSyncing(false)
    onSyncDone?.()
  }

  if (diffs === null) return <div style={{ ...s.notChecked, marginTop:'0.5rem' }}>Loading…</div>
  if (diffs.length === 0) return null

  return (
    <div style={s.pending}>
      <div style={s.pendingHead}>
        <span style={s.pendingLbl}>
          Pending files
          <span style={s.badge(diffs.length)}>{diffs.length}</span>
        </span>
      </div>
      <table style={s.table}>
        <tbody>
          {renderDiffTree(buildDiffTree(diffs), 0, expanded, toggleExpanded, selected, togglePath, toggleDir)}
        </tbody>
      </table>
      <div style={s.syncBar}>
        <button style={s.selectAll} onClick={toggleAll}>
          {selected.size === diffs.length ? 'Deselect all' : 'Select all'}
        </button>
        <button
          style={selected.size && !syncing ? s.btnSync : s.btnBusy}
          onClick={sync}
          disabled={!selected.size || syncing}
        >
          {syncing ? 'Syncing…' : <span style={{ display:'inline-flex', alignItems:'center', gap:'4px' }}><LuUpload size={11} />Sync {selected.size} file{selected.size !== 1 ? 's' : ''} to server</span>}
        </button>
      </div>
    </div>
  )
}

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [discovering, setDiscovering] = useState({})
  const [snapshotting, setSnapshotting] = useState({})
  const [restarting, setRestarting] = useState({})
  const [pendingCounts, setPendingCounts] = useState({})

  async function load(initial = false) {
    if (initial) setLoading(true)
    const { data } = await supabase
      .from('devices')
      .select('*')
      .order('last_seen_at', { ascending: false })
    setDevices(data ?? [])
    if (initial) setLoading(false)
  }

  async function loadPendingCounts(deviceList) {
    if (!deviceList.length) return
    const ids = deviceList.map(d => d.id)
    const { data } = await supabase
      .from('discovery_results')
      .select('device_id')
      .in('device_id', ids)
    const counts = {}
    for (const row of data ?? []) {
      counts[row.device_id] = (counts[row.device_id] ?? 0) + 1
    }
    setPendingCounts(counts)
  }

  async function broadcastToDevice(deviceId, event, payload = {}) {
    await new Promise((resolve) => {
      const ch = supabase.channel(`device:${deviceId}`)
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({ type: 'broadcast', event, payload })
            .finally(() => { supabase.removeChannel(ch); resolve() })
        }
      })
    })
  }

  async function discover(id) {
    setDiscovering(d => ({ ...d, [id]: true }))
    await broadcastToDevice(id, 'discover')
    setTimeout(async () => {
      await loadPendingCounts(devices)
      setDiscovering(d => ({ ...d, [id]: false }))
    }, 4000)
  }

  async function snapshot(id) {
    setSnapshotting(s => ({ ...s, [id]: true }))
    await broadcastToDevice(id, 'snapshot')
    setTimeout(() => setSnapshotting(s => ({ ...s, [id]: false })), 3000)
  }

  async function restart(id) {
    setRestarting(r => ({ ...r, [id]: true }))
    await supabase.functions.invoke('device-restart', { body: { device_id: id } })
    setTimeout(() => setRestarting(r => ({ ...r, [id]: false })), 3000)
  }

  async function remove(id) {
    const device = devices.find(d => d.id === id)
    await supabase.from('devices').delete().eq('id', id)
    if (device) {
      await supabase.from('device_blocklist').upsert({
        user_id: device.user_id,
        mac_address: device.mac_address ?? null,
        hostname: device.hostname,
      }, { onConflict: 'user_id,hostname', ignoreDuplicates: true })
    }
    setDevices(d => d.filter(x => x.id !== id))
  }

  useEffect(() => {
    load(true).then(() => {})
  }, [])

  useEffect(() => {
    if (devices.length) loadPendingCounts(devices)
    const t = setInterval(() => {
      load(false)
      loadPendingCounts(devices)
    }, 30_000)
    return () => clearInterval(t)
  }, [devices.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function pendingState(device) {
    if (!device.last_discovered_at) return 'unchecked'
    const count = pendingCounts[device.id] ?? 0
    return count > 0 ? 'pending' : 'synced'
  }

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>Devices ({devices.length})</h2>
        <button style={{ ...s.refresh, display:'inline-flex', alignItems:'center', gap:'5px' }} onClick={() => load(true)}><LuRefreshCw size={13} />Refresh</button>
      </div>
      {loading && <div style={s.empty}>Loading…</div>}
      {!loading && devices.length === 0 && <div style={s.empty}>No devices. Install the agent on a machine to get started.</div>}
      {!loading && devices.map(d => {
        const now = Date.now()
        const online = (now - new Date(d.last_seen_at).getTime()) < 90_000
        const state = pendingState(d)
        const count = pendingCounts[d.id] ?? 0
        return (
          <div key={d.id} style={s.device}>
            <div style={s.deviceTop}>
              <div style={s.dot(online)} />
              <div style={{ flex:1 }}>
                <div style={s.name}>{d.name}</div>
                <div style={s.meta}>
                  {d.hostname} · {d.platform} · v{d.agent_version}<br />
                  Last seen: {ago(d.last_seen_at)}<br />
                  {state === 'unchecked' && <span style={s.notChecked}>Not checked</span>}
                  {state === 'synced' && <span style={{ ...s.upToDate, display:'inline-flex', alignItems:'center', gap:'3px' }}><LuCheck size={12} />Up to date · checked {ago(d.last_discovered_at)}</span>}
                  {state === 'pending' && <span style={{ fontSize:'0.75rem', color:'#fb923c' }}>{count} file{count !== 1 ? 's' : ''} pending · checked {ago(d.last_discovered_at)}</span>}
                </div>
                <div style={s.actions}>
                  <button
                    style={discovering[d.id] ? s.btnBusy : s.btnDiscover}
                    onClick={() => discover(d.id)}
                    disabled={!!discovering[d.id]}
                    title="Compare local files on this device with server"
                  >
                    {discovering[d.id] ? 'Discovering…' : <span style={{ display:'inline-flex', alignItems:'center', gap:'4px' }}><LuSearch size={11} />Discover files</span>}
                  </button>
                  <button
                    style={snapshotting[d.id] ? s.btnBusy : s.btnSnapshot}
                    onClick={() => snapshot(d.id)}
                    disabled={!!snapshotting[d.id]}
                    title="Send all synced files from server to this device"
                  >
                    {snapshotting[d.id] ? 'Sending…' : <span style={{ display:'inline-flex', alignItems:'center', gap:'4px' }}><LuDownload size={11} />Send files to this machine</span>}
                  </button>
                  <button
                    style={restarting[d.id] ? s.btnBusy : s.btnRestart}
                    onClick={() => restart(d.id)}
                    disabled={!!restarting[d.id]}
                    title="Send restart signal to agent on this device"
                  >
                    {restarting[d.id] ? 'Restarting…' : <span style={{ display:'inline-flex', alignItems:'center', gap:'4px' }}><LuRotateCcw size={11} />Restart agent</span>}
                  </button>
                </div>
              </div>
              <button style={s.del} onClick={() => remove(d.id)} title="Remove device"><LuX size={14} /></button>
            </div>
            {state === 'pending' && (
              <PendingPanel
                device={d}
                onSyncDone={() => {
                  setPendingCounts(c => ({ ...c, [d.id]: 0 }))
                  load(false)
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
