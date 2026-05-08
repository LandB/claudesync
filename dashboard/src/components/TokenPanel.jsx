import { useEffect, useState } from 'react'
import { LuCheck, LuCopy } from 'react-icons/lu'
import { supabase } from '../supabase'

const s = {
  wrap:    { padding:'1.5rem 0' },
  h2:      { fontSize:'1.1rem', fontWeight:'600', color:'#fff', marginBottom:'1rem' },
  card:    { background:'#1a1a1a', border:'1px solid #252525', borderRadius:'8px', padding:'1.25rem' },
  label:   { fontSize:'0.75rem', color:'#666', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.5rem' },
  tok:     { fontFamily:'monospace', fontSize:'0.9rem', color:'#a78bfa', wordBreak:'break-all', marginBottom:'1rem' },
  row:     { display:'flex', gap:'0.5rem', flexWrap:'wrap' },
  btn:     (danger) => ({ padding:'6px 14px', borderRadius:'6px', cursor:'pointer', fontSize:'0.82rem', border: danger ? '1px solid #7f1d1d' : '1px solid #333', background:'none', color: danger ? '#f87171' : '#aaa' }),
  install: { marginTop:'1.5rem' },
  codeWrap:{ position:'relative' },
  code:    { background:'#111', border:'1px solid #252525', borderRadius:'6px', padding:'1rem', fontFamily:'monospace', fontSize:'0.8rem', color:'#6ee7b7', whiteSpace:'pre-wrap', wordBreak:'break-all' },
  cpyBtn:  (ok) => ({ position:'absolute', top:'8px', right:'8px', background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'5px', color: ok ? '#4ade80' : '#555', cursor:'pointer', fontSize:'0.75rem', padding:'3px 8px', lineHeight:'1.4' }),
  msg:     (ok) => ({ marginTop:'0.5rem', fontSize:'0.8rem', color: ok ? '#22c55e' : '#f87171' }),
  warn:    { background:'#1c1007', border:'1px solid #78350f', borderRadius:'6px', padding:'0.75rem', fontSize:'0.82rem', color:'#fb923c', marginBottom:'1rem' },
}

export default function TokenPanel() {
  const [token, setToken] = useState(null)
  const [url, setUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedInstall, setCopiedInstall] = useState(false)
  const [copiedWin, setCopiedWin] = useState(false)
  const [copiedStartUnix, setCopiedStartUnix] = useState(false)
  const [copiedStartWin, setCopiedStartWin] = useState(false)
  const [copiedMcp, setCopiedMcp] = useState(false)
  const [msg, setMsg] = useState(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    setUrl(import.meta.env.VITE_SUPABASE_URL)
    supabase.from('profiles').select('token').single()
      .then(({ data }) => setToken(data?.token ?? null))
  }, [])

  function copy() {
    navigator.clipboard.writeText(token)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function regenerate() {
    if (!confirming) { setConfirming(true); return }
    setConfirming(false); setMsg(null)
    const newToken = crypto.randomUUID()
    const { error } = await supabase.from('profiles').update({ token: newToken }).eq('id', (await supabase.auth.getUser()).data.user.id)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setToken(newToken)
    setMsg({ ok: true, text: 'Token regenerated. All agents must be reinstalled.' })
  }

  const installCmd = token
    ? `curl -fsSL "${url}/functions/v1/install-script?token=${token}" | bash`
    : ''
  const winInstallCmd = token
    ? `$tmp="$env:TEMP\\cs-install.ps1"; irm "${url}/functions/v1/install-script?token=${token}&platform=win" -OutFile $tmp; & $tmp`
    : ''
  const mcpCmd = token
    ? `claude mcp add --transport http claudesync \\\n  ${url}/functions/v1/mcp \\\n  --header 'Authorization: Bearer ${token}' \\\n  --scope user`
    : ''

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>Agent Token</h2>
      <div style={s.card}>
        <div style={s.label}>Bearer Token</div>
        <div style={s.tok}>{token ?? 'Loading…'}</div>
        <div style={s.row}>
          <button style={{ ...s.btn(false), display:'inline-flex', alignItems:'center', gap:'5px' }} onClick={copy}>{copied ? <><LuCheck size={13} />Copied</> : 'Copy'}</button>
          {confirming
            ? <button style={s.btn(true)} onClick={regenerate}>Confirm regenerate?</button>
            : <button style={s.btn(false)} onClick={regenerate}>Regenerate</button>
          }
        </div>
        {msg && <div style={s.msg(msg.ok)}>{msg.text}</div>}
      </div>

      <div style={s.install}>
        <div style={{ ...s.label, marginBottom:'0.5rem', marginTop:'1.5rem' }}>Install Agent — macOS / Linux</div>
        <div style={s.codeWrap}>
          <div style={s.code}>{installCmd}</div>
          <button style={s.cpyBtn(copiedInstall)} onClick={() => {
            navigator.clipboard.writeText(installCmd)
            setCopiedInstall(true); setTimeout(() => setCopiedInstall(false), 2000)
          }}>{copiedInstall ? <LuCheck size={12} /> : <LuCopy size={12} />}</button>
        </div>

        <div style={{ ...s.label, marginBottom:'0.5rem', marginTop:'1.25rem' }}>Install Agent — Windows (PowerShell, run as Administrator)</div>
        <div style={s.codeWrap}>
          <div style={s.code}>{winInstallCmd}</div>
          <button style={s.cpyBtn(copiedWin)} onClick={() => {
            navigator.clipboard.writeText(winInstallCmd)
            setCopiedWin(true); setTimeout(() => setCopiedWin(false), 2000)
          }}>{copiedWin ? <LuCheck size={12} /> : <LuCopy size={12} />}</button>
        </div>

        <div style={{ ...s.label, marginBottom:'0.5rem', marginTop:'1.25rem' }}>Start Agent — macOS / Linux</div>
        <div style={s.codeWrap}>
          <div style={s.code}>{'# macOS\nlaunchctl start com.claudesync.agent\n# Linux\nsystemctl --user start claudesync.service'}</div>
          <button style={s.cpyBtn(copiedStartUnix)} onClick={() => {
            navigator.clipboard.writeText('launchctl start com.claudesync.agent')
            setCopiedStartUnix(true); setTimeout(() => setCopiedStartUnix(false), 2000)
          }}>{copiedStartUnix ? <LuCheck size={12} /> : <LuCopy size={12} />}</button>
        </div>

        <div style={{ ...s.label, marginBottom:'0.5rem', marginTop:'1.25rem' }}>Start Agent — Windows (PowerShell)</div>
        <div style={s.codeWrap}>
          <div style={s.code}>{'Start-ScheduledTask -TaskName "ClaudeSync Agent"'}</div>
          <button style={s.cpyBtn(copiedStartWin)} onClick={() => {
            navigator.clipboard.writeText('Start-ScheduledTask -TaskName "ClaudeSync Agent"')
            setCopiedStartWin(true); setTimeout(() => setCopiedStartWin(false), 2000)
          }}>{copiedStartWin ? <LuCheck size={12} /> : <LuCopy size={12} />}</button>
        </div>

        <div style={{ ...s.label, marginBottom:'0.5rem', marginTop:'1.25rem' }}>Add MCP to Claude Code</div>
        <div style={s.codeWrap}>
          <div style={s.code}>{mcpCmd}</div>
          <button style={s.cpyBtn(copiedMcp)} onClick={() => {
            navigator.clipboard.writeText(mcpCmd.replace(/\\\n\s+/g, ' '))
            setCopiedMcp(true); setTimeout(() => setCopiedMcp(false), 2000)
          }}>{copiedMcp ? <LuCheck size={12} /> : <LuCopy size={12} />}</button>
        </div>
      </div>
    </div>
  )
}
