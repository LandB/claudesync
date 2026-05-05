import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:    { padding: '1.5rem 0' },
  head:    { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' },
  h2:      { fontSize:'1.1rem', fontWeight:'600', color:'#fff' },
  refresh: { background:'none', border:'1px solid #333', color:'#aaa', padding:'4px 10px', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' },
  empty:   { color:'#555', fontSize:'0.9rem' },
  device:  { background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'1rem', marginBottom:'0.75rem', display:'flex', alignItems:'flex-start', gap:'1rem' },
  dot:     (online) => ({ width:8, height:8, borderRadius:'50%', background: online ? '#22c55e' : '#3f3f3f', marginTop:6, flexShrink:0 }),
  name:    { fontWeight:'600', color:'#fff', fontSize:'0.95rem' },
  meta:    { color:'#666', fontSize:'0.8rem', marginTop:'2px', lineHeight:'1.6' },
  del:     { marginLeft:'auto', background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:'1.1rem', padding:'4px 8px', borderRadius:'4px' },
}

function ago(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}

export default function Devices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('devices')
      .select('*')
      .order('last_seen_at', { ascending: false })
    setDevices(data ?? [])
    setLoading(false)
  }

  async function remove(id) {
    await supabase.from('devices').delete().eq('id', id)
    setDevices(d => d.filter(x => x.id !== id))
  }

  useEffect(() => { load() }, [])

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.h2}>Devices ({devices.length})</h2>
        <button style={s.refresh} onClick={load}>↻ Refresh</button>
      </div>
      {loading && <div style={s.empty}>Loading…</div>}
      {!loading && devices.length === 0 && <div style={s.empty}>No devices. Install the agent on a machine to get started.</div>}
      {devices.map(d => {
        const online = (Date.now() - new Date(d.last_seen_at).getTime()) < 90_000
        return (
          <div key={d.id} style={s.device}>
            <div style={s.dot(online)} />
            <div style={{ flex:1 }}>
              <div style={s.name}>{d.name}</div>
              <div style={s.meta}>
                {d.hostname} · {d.platform} · v{d.agent_version}<br />
                Last seen: {ago(d.last_seen_at)}<br />
                <span style={{ color:'#444', fontSize:'0.75rem' }}>{d.id}</span>
              </div>
            </div>
            <button style={s.del} onClick={() => remove(d.id)} title="Remove device">✕</button>
          </div>
        )
      })}
    </div>
  )
}
