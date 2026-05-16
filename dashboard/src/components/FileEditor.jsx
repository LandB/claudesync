import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:        { padding: '1.5rem 0' },
  head:        { display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1rem', flexWrap:'wrap' },
  h2:          { fontSize:'1.1rem', fontWeight:'600', color:'#fff' },
  sel:         { background:'#1a1a1a', border:'1px solid #333', color:'#e8e8e8', padding:'4px 10px', borderRadius:'6px', fontSize:'0.85rem', cursor:'pointer' },
  badge:       { fontSize:'0.75rem', color:'#555', marginLeft:'auto' },
  ta:          { width:'100%', minHeight:'400px', background:'#111', border:'1px solid #252525', borderRadius:'8px', color:'#e8e8e8', padding:'1rem', fontSize:'0.85rem', fontFamily:'monospace', lineHeight:'1.6', resize:'vertical', outline:'none' },
  row:         { display:'flex', gap:'0.5rem', marginTop:'0.75rem', flexWrap:'wrap' },
  btn:         (primary) => ({ padding:'6px 16px', borderRadius:'6px', cursor:'pointer', fontSize:'0.85rem', background: primary ? '#7c3aed' : '#1a1a1a', color: primary ? '#fff' : '#aaa', border: primary ? 'none' : '1px solid #333' }),
  btnDanger:   { padding:'6px 16px', borderRadius:'6px', cursor:'pointer', fontSize:'0.85rem', border:'1px solid #7f1d1d', background:'none', color:'#f87171' },
  msg:         (ok) => ({ marginTop:'0.5rem', fontSize:'0.8rem', color: ok ? '#22c55e' : '#f87171' }),
  empty:       { color:'#555', fontSize:'0.9rem' },
  overlay:     { position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 },
  dialog:      { background:'#1a1a1a', border:'1px solid #333', borderRadius:'10px', padding:'1.5rem', maxWidth:420, width:'90%' },
  dialogTitle: { fontSize:'1rem', fontWeight:'600', color:'#fff', marginBottom:'0.5rem' },
  dialogBody:  { fontSize:'0.85rem', color:'#aaa', lineHeight:'1.6', marginBottom:'1.25rem' },
  dialogNote:  { fontSize:'0.8rem', color:'#555', marginTop:'0.5rem' },
  dialogRow:   { display:'flex', gap:'0.5rem', justifyContent:'flex-end' },
}

export default function FileEditor() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [original, setOriginal] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState(null) // { type: 'file' | 'all' }
  const [msg, setMsg] = useState(null)

  useEffect(() => { loadFiles() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFiles() {
    const { data } = await supabase.from('sync_files').select('path, storage_path, hash, size_bytes, updated_at')
      .eq('deleted', false).order('path')
    setFiles(data ?? [])
    if (data?.length) selectFile(data[0])
    else { setSelected(null); setContent(''); setOriginal('') }
  }

  async function selectFile(file) {
    setSelected(file)
    setMsg(null)
    const { data: signed, error: signErr } = await supabase.storage
      .from('claude-env')
      .createSignedUrl(file.storage_path, 60)
    if (signErr) { setContent('// Error loading file: ' + signErr.message); return }
    const res = await fetch(signed.signedUrl, { cache: 'no-store' })
    if (!res.ok) { setContent('// Error loading file: ' + res.status); return }
    const text = await res.text()
    setContent(text)
    setOriginal(text)
  }

  async function save() {
    if (!selected || content === original) return
    setSaving(true); setMsg(null)
    try {
      const bytes = new TextEncoder().encode(content)
      const hashBuf = await crypto.subtle.digest('SHA-256', bytes)
      const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')

      const { error: upErr } = await supabase.storage.from('claude-env')
        .upload(selected.storage_path, bytes, { upsert: true, contentType: 'text/plain', cacheControl: '0' })
      if (upErr) throw upErr

      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('sync_files').upsert({
        user_id: user.id, path: selected.path, hash,
        storage_path: selected.storage_path, size_bytes: bytes.length,
        updated_at: new Date().toISOString(), deleted: false,
      }, { onConflict: 'user_id,path' })

      const { data: devices } = await supabase.from('devices').select('id')
      if (devices?.length) {
        await Promise.all(devices.map(d => new Promise(resolve => {
          const ch = supabase.channel(`device:${d.id}`)
          ch.subscribe(status => {
            if (status === 'SUBSCRIBED') {
              ch.send({ type: 'broadcast', event: 'pull-files', payload: { files: [selected.path] } })
                .finally(() => { supabase.removeChannel(ch); resolve() })
            }
          })
        })))
      }

      setOriginal(content)
      setMsg({ ok: true, text: `Saved · sent to ${devices?.length ?? 0} device(s)` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
    setSaving(false)
  }

  async function deleteFile() {
    setConfirm(null)
    if (!selected) return
    setDeleting(true); setMsg(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.storage.from('claude-env').remove([selected.storage_path])
      await supabase.from('sync_files')
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('path', selected.path)
      await loadFiles()
      setMsg({ ok: true, text: 'Deleted from server' })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
    setDeleting(false)
  }

  async function deleteAll() {
    setConfirm(null)
    setDeleting(true); setMsg(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const storagePaths = files.map(f => f.storage_path)
      if (storagePaths.length) await supabase.storage.from('claude-env').remove(storagePaths)
      await supabase.from('sync_files')
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('deleted', false)
      await loadFiles()
      setMsg({ ok: true, text: `Deleted ${storagePaths.length} file(s) from server` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
    setDeleting(false)
  }

  function discard() { setContent(original); setMsg(null) }
  const dirty = content !== original

  function groupedFiles() {
    const root = []
    const groups = new Map()
    for (const f of files) {
      const slash = f.path.indexOf('/')
      if (slash === -1) { root.push(f); continue }
      const folder = f.path.slice(0, slash)
      if (!groups.has(folder)) groups.set(folder, [])
      groups.get(folder).push(f)
    }
    return { root, groups }
  }

  return (
    <div style={s.wrap}>
      {confirm && (
        <div style={s.overlay} onClick={() => setConfirm(null)}>
          <div style={s.dialog} onClick={e => e.stopPropagation()}>
            <div style={s.dialogTitle}>
              {confirm.type === 'file' ? `Delete "${selected?.path}"?` : `Delete all ${files.length} file(s)?`}
            </div>
            <div style={s.dialogBody}>
              {confirm.type === 'file'
                ? 'This file will be removed from the server.'
                : 'All files will be removed from the server.'}
              <div style={s.dialogNote}>
                Files on your machines are not affected. Use "Pull from server" on a device to re-sync after saving new files.
              </div>
            </div>
            <div style={s.dialogRow}>
              <button style={s.btn(false)} onClick={() => setConfirm(null)}>Cancel</button>
              <button style={s.btnDanger} onClick={confirm.type === 'file' ? deleteFile : deleteAll} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={s.head}>
        <h2 style={s.h2}>Files</h2>
        {files.length > 0 && <>
          <select style={s.sel} value={selected?.path ?? ''} onChange={e => selectFile(files.find(f => f.path === e.target.value))}>
            {(() => { const { root, groups } = groupedFiles(); return [
              ...root.map(f => <option key={f.path} value={f.path}>{f.path}</option>),
              ...[...groups.entries()].map(([folder, gfiles]) => (
                <optgroup key={folder} label={folder + '/'}>
                  {gfiles.map(f => <option key={f.path} value={f.path}>{f.path.slice(folder.length + 1)}</option>)}
                </optgroup>
              ))
            ]})()}
          </select>
          {selected && <span style={s.badge}>{(selected.size_bytes / 1024).toFixed(1)} KB</span>}
        </>}
      </div>
      {files.length === 0
        ? <div style={s.empty}>No files synced yet. Install the agent and it will appear here.</div>
        : <>
            <textarea style={s.ta} value={content} onChange={e => setContent(e.target.value)} spellCheck={false} />
            <div style={s.row}>
              <button style={s.btn(true)} onClick={save} disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save & Sync'}
              </button>
              {dirty && <button style={s.btn(false)} onClick={discard}>Discard</button>}
              <button style={s.btnDanger} onClick={() => setConfirm({ type: 'file' })} disabled={deleting}>
                Delete file
              </button>
              <button style={s.btnDanger} onClick={() => setConfirm({ type: 'all' })} disabled={deleting}>
                Delete all files
              </button>
            </div>
            {msg && <div style={s.msg(msg.ok)}>{msg.text}</div>}
          </>
      }
    </div>
  )
}
