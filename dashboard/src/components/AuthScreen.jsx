import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../supabase'

const s = {
  wrap:  { display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', padding:'2rem' },
  card:  { width:'100%', maxWidth:'400px' },
  logo:  { textAlign:'center', marginBottom:'2rem' },
  title: { fontSize:'1.8rem', fontWeight:'700', letterSpacing:'-0.5px', color:'#fff' },
  sub:   { fontSize:'0.85rem', color:'#888', marginTop:'0.25rem' },
}

export default function AuthScreen() {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logo}>
          <div style={s.title}>ClaudeSync</div>
          <div style={s.sub}>Keep your Claude Code environment in sync</div>
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand:'#7c3aed', brandAccent:'#6d28d9' } } } }}
          providers={[]}
          view="sign_in"
        />
      </div>
    </div>
  )
}
