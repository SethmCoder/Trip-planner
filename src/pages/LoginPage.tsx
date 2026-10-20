import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/data'
export default function LoginPage() {
  const [id, setId] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [sent, setSent] = useState(''); const [sending, setSending] = useState(false)
  const { login } = useAuth(); const nav = useNavigate()
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSent(''); try { await login(id, pw); nav('/') } catch (x: any) { setErr(x.message) } }
  const forgot = async () => {
    setErr(''); setSent('')
    if (!id.trim()) { setErr('Enter your username or email above, then click Forgot password'); return }
    setSending(true)
    try { await api.requestPasswordReset(id); setSent('If an account exists for that username/email, a password reset link has been sent. Check your email (and spam folder), then click the link to set a new password.') }
    catch (x: any) { setErr(x.message) }
    finally { setSending(false) }
  }
  return <AuthCard title="Login"><form onSubmit={submit}>
    <label>Username/Email</label><input value={id} onChange={e => setId(e.target.value)} required autoComplete="username" />
    <label>Password</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} required autoComplete="current-password" />
    <div style={{ textAlign: 'right', marginTop: 8 }}>
      <button type="button" onClick={forgot} disabled={sending} style={{ background: 'none', border: 'none', color: 'var(--orange)', fontWeight: 700, fontSize: 13, padding: 0 }}>{sending ? 'Sending…' : 'Forgot password?'}</button>
    </div>
    <div className="error">{err}</div>
    {sent && <div className="success">{sent}</div>}
    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
      <button className="btn-orange" style={{ flex: 1 }} type="submit">Login</button>
      <button className="btn-outline" style={{ flex: 1 }} type="button" onClick={() => nav('/create-account')}>Create new account</button>
    </div></form></AuthCard>
}
