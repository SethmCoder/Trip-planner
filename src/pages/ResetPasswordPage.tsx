import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import * as api from '../lib/data'
import { supabase } from '../lib/supabase'
export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false); const [checking, setChecking] = useState(true)
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState(false)
  const nav = useNavigate()
  useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined
    api.hasRecoverySession().then(ok => { setReady(ok); setChecking(false) })
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') { setReady(true); setChecking(false) } })
      sub = data.subscription
    }
    const t = setTimeout(() => setChecking(false), 2500)
    return () => { sub?.unsubscribe(); clearTimeout(t) }
  }, [])
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) { setErr('Passwords do not match'); return }
    try { await api.updatePasswordFromRecovery(pw); await api.logout(); setDone(true) } catch (x: any) { setErr(x.message) }
  }
  if (checking) return <AuthCard title="Reset Password"><p>Checking your reset link…</p></AuthCard>
  if (done) return <AuthCard title="Reset Password"><p className="success">Your password has been changed.</p><button className="btn-orange" style={{ width: '100%', marginTop: 12 }} onClick={() => nav('/login')}>Back to Login</button></AuthCard>
  if (!ready) return <AuthCard title="Reset Password"><p>This reset link is invalid or has expired. Request a new one from the login page.</p><button className="btn-orange" style={{ width: '100%', marginTop: 12 }} onClick={() => nav('/login')}>Back to Login</button></AuthCard>
  return <AuthCard title="Reset Password"><form onSubmit={submit}>
    <label>New Password</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} autoComplete="new-password" />
    <label>Confirm New Password</label><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} required minLength={6} autoComplete="new-password" />
    <div className="error">{err}</div>
    <button className="btn-orange" style={{ width: '100%', marginTop: 14 }} type="submit">Save New Password</button>
  </form></AuthCard>
}
