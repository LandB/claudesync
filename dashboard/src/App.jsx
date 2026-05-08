import { useEffect, useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { LuLayoutDashboard, LuMonitor, LuFiles, LuPuzzle, LuTriangleAlert, LuKeyRound, LuRefreshCw } from 'react-icons/lu'
import { supabase } from './supabase'
import AuthScreen    from './components/AuthScreen'
import Devices       from './components/Devices'
import FileEditor    from './components/FileEditor'
import TokenPanel    from './components/TokenPanel'
import SyncPanel     from './components/SyncPanel'
import PluginManager from './components/PluginManager'
import ConflictLog   from './components/ConflictLog'

const NAV = [
  { to: '/',          label: 'Overview',        Icon: LuLayoutDashboard },
  { to: '/devices',   label: 'Devices',         Icon: LuMonitor },
  { to: '/files',     label: 'Files',           Icon: LuFiles },
  { to: '/plugins',   label: 'Plugins',         Icon: LuPuzzle },
  { to: '/conflicts', label: 'Conflicts',       Icon: LuTriangleAlert },
  { to: '/token',     label: 'Token & Install', Icon: LuKeyRound },
]

const s = {
  app:    { display:'flex', minHeight:'100vh' },
  side:   { width:'200px', background:'#111', borderRight:'1px solid #1a1a1a', padding:'1.5rem 1rem', flexShrink:0, display:'flex', flexDirection:'column' },
  logo:   { fontWeight:'700', fontSize:'1rem', color:'#fff', marginBottom:'2rem', letterSpacing:'-0.3px' },
  nav:    { flex:1 },
  item:   ({ isActive }) => ({
    display:'block', width:'100%', textAlign:'left',
    background: isActive ? '#1e1e2e' : 'none',
    border:'none', color: isActive ? '#a78bfa' : '#666',
    padding:'8px 12px', borderRadius:'6px',
    cursor:'pointer', fontSize:'0.88rem', marginBottom:'2px',
    transition:'color 0.1s', textDecoration:'none',
  }),
  user:   { fontSize:'0.75rem', color:'#444', wordBreak:'break-all', paddingTop:'1rem', borderTop:'1px solid #1a1a1a' },
  logout: { marginTop:'0.5rem', background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:'0.8rem', padding:'0', textAlign:'left' },
  main:   { flex:1, padding:'2rem 2.5rem', maxWidth:'900px', overflowY:'auto' },
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <AuthScreen />

  return (
    <div style={s.app}>
      <aside style={s.side}>
        <div style={{ ...s.logo, display:'flex', alignItems:'center', gap:'6px' }}><LuRefreshCw size={14} />ClaudeSync</div>
        <nav style={s.nav}>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} style={s.item}>
              {({ isActive }) => (
                <span style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <Icon size={15} />
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div style={s.user}>
          {session.user.email}
          <br />
          <button style={s.logout} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>
      <main style={s.main}>
        <Routes>
          <Route path="/"          element={<SyncPanel />} />
          <Route path="/devices"   element={<Devices />} />
          <Route path="/files"     element={<FileEditor />} />
          <Route path="/plugins"   element={<PluginManager />} />
          <Route path="/conflicts" element={<ConflictLog />} />
          <Route path="/token"     element={<TokenPanel />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
