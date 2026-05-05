import { useState } from 'react'
import { supabase } from '../supabase'

const s = {
  wrap:   { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'2rem' },
  card:   { width:'100%', maxWidth:'380px' },
  logo:   { textAlign:'center', marginBottom:'2rem' },
  title:  { fontSize:'1.8rem', fontWeight:'700', letterSpacing:'-0.5px', color:'#fff' },
  sub:    { fontSize:'0.85rem', color:'#888', marginTop:'0.25rem' },
  label:  { display:'block', fontSize:'0.8rem', color:'#666', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.05em' },
  input:  { width:'100%', background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:'8px', color:'#e8e8e8', padding:'10px 14px', fontSize:'0.9rem', outline:'none', marginBottom:'1rem' },
  btn:    { width:'100%', background:'#7c3aed', border:'none', borderRadius:'8px', color:'#fff', padding:'11px', fontSize:'0.95rem', fontWeight:'600', cursor:'pointer', marginTop:'0.25rem' },
  toggle: { background:'none', border:'none', color:'#7c3aed', cursor:'pointer', fontSize:'0.85rem', marginTop:'1rem', display:'block', width:'100%', textAlign:'center' },
  err:    { color:'#f87171', fontSize:'0.82rem', marginBottom:'0.75rem', textAlign:'center' },
  ok:     { color:'#4ade80', fontSize:'0.82rem', marginBottom:'0.75rem', textAlign:'center' },
}

export default function AuthScreen() {
  const [mode, setMode]       = useState('signin')   // 'signin' | 'signup' | 'magic'
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState(null)

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setMsg(null)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMsg({ ok: true, text: 'Magic link sent — check your email.' })
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg({ ok: true, text: 'Account created — check email to confirm.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
    setLoading(false)
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logo}>
          <div style={s.title}>⟳ ClaudeSync</div>
          <div style={s.sub}>Keep your Claude Code environment in sync</div>
        </div>

        <form onSubmit={submit}>
          {msg && <div style={msg.ok ? s.ok : s.err}>{msg.text}</div>}

          <label style={s.label}>Email</label>
          <input style={s.input} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />

          {mode !== 'magic' && <>
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </>}

          <button style={s.btn} disabled={loading}>
            {loading ? '…' : mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send magic link' : 'Sign in'}
          </button>
        </form>

        <button style={s.toggle} onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setMsg(null) }}>
          {mode === 'signup' ? 'Already have an account? Sign in' : 'No account? Sign up'}
        </button>
        <button style={{ ...s.toggle, color:'#555', marginTop:'0.25rem' }} onClick={() => { setMode(m => m === 'magic' ? 'signin' : 'magic'); setMsg(null) }}>
          {mode === 'magic' ? '← Back to password login' : 'Sign in with magic link'}
        </button>
      </div>
    </div>
  )
}
