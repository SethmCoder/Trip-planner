import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
export default function LoginPage() {
  const [id, setId] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const { login } = useAuth(); const nav = useNavigate()
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await login(id, pw); nav('/') } catch (x: any) { setErr(x.message) } }
  return <AuthCard title="Login"><form onSubmit={submit}>
    <label>Username/Email</label><input value={id} onChange={e => setId(e.target.value)} required autoComplete="username" />
    <label>Password</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} required autoComplete="current-password" />
    <div className="error">{err}</div>
    {!isSupabaseConfigured && <p style={{ fontSize: 12, color: '#555' }}>Demo mode (no Supabase keys): use <b>demo</b> / <b>demo1234</b> or create an account.</p>}
    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
      <button className="btn-orange" style={{ flex: 1 }} type="submit">Login</button>
      <button className="btn-outline" style={{ flex: 1 }} type="button" onClick={() => nav('/create-account')}>Create new account</button>
    </div></form></AuthCard>
}
