import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthCard from '../components/AuthCard'
import { useAuth } from '../context/AuthContext'
export default function CreateAccountPage() {
  const [email, setEmail] = useState(''); const [username, setUsername] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const { createAccount } = useAuth(); const nav = useNavigate()
  const submit = async (e: React.FormEvent) => { e.preventDefault(); try { await createAccount(email.trim(), username.trim(), pw); nav('/') } catch (x: any) { setErr(x.message) } }
  return <AuthCard title="Create Account"><form onSubmit={submit}>
    <label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
    <label>Username</label><input value={username} onChange={e => setUsername(e.target.value)} required />
    <label>Password</label><input type="password" value={pw} onChange={e => setPw(e.target.value)} required minLength={6} />
    <div className="error">{err}</div>
    <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
      <button className="btn-orange" style={{ flex: 1 }} type="submit">Create Account &amp; Login</button>
      <button className="btn-outline" style={{ flex: 1 }} type="button" onClick={() => nav('/login')}>Back to Login</button>
    </div></form></AuthCard>
}
