import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import AuthScreen from './components/AuthScreen'
import Devices    from './components/Devices'
import FileEditor from './components/FileEditor'
import TokenPanel from './components/TokenPanel'
import SyncPanel  from './components/SyncPanel'

const VIEWS = ['overview', 'devices', 'files', 'token']

const s = {
  app:    { display:'flex', minHeight:'100vh' },
  side:   { width:'200px', background:'#111', borderRight:'1px solid #1a1a1a', padding:'1.5rem 1rem', flexShrink:0, display:'flex', flexDirection:'column' },
  logo:   { fontWeight:'700', fontSize:'1rem', color:'#fff', marginBottom:'2rem', letterSpacing:'-0.3px' },
  nav:    { flex:1 },
  item:   (active) => ({
    display:'block', width:'100%', textAlign:'left', background: active ? '#1e1e2e' : 'none',
    border:'none', color: active ? '#a78bfa' : '#666', padding:'8px 12px', borderRadius:'6px',
    cursor:'pointer', fontSize:'0.88rem', marginBottom:'2px', transition:'color 0.1s',
  }),
  user:   { fontSize:'0.75rem', color:'#444', wordBreak:'break-all', paddingTop:'1rem', borderTop:'1px solid #1a1a1a' },
  logout: { marginTop:'0.5rem', background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:'0.8rem', padding:'0', textAlign:'left' },
  main:   { flex:1, padding:'2rem 2.5rem', maxWidth:'900px', overflowY:'auto' },
}

const LABELS = { overview:'Overview', devices:'Devices', files:'Files', token:'Token & Install' }
const ICONS  = { overview:'◈', devices:'⬡', files:'≡', token:'◉' }

export default function App() {
  const [session, setSession] = useState(undefined)
  const [view, setView]       = useState('overview')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <AuthScreen />

  const email = session.user.email

  function logout() { supabase.auth.signOut() }

  return (
    <div style={s.app}>
      <aside style={s.side}>
        <div style={s.logo}>⟳ ClaudeSync</div>
        <nav style={s.nav}>
          {VIEWS.map(v => (
            <button key={v} style={s.item(view === v)} onClick={() => setView(v)}>
              {ICONS[v]} {LABELS[v]}
            </button>
          ))}
        </nav>
        <div style={s.user}>
          {email}
          <br />
          <button style={s.logout} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main style={s.main}>
        {view === 'overview' && <SyncPanel />}
        {view === 'devices'  && <Devices />}
        {view === 'files'    && <FileEditor />}
        {view === 'token'    && <TokenPanel />}
      </main>
    </div>
  )
}
