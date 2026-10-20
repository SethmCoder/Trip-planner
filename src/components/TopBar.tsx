import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/data'
import { fmtDate, type Trip } from '../lib/types'

export default function TopBar() {
  const { profile, logout } = useAuth(); const nav = useNavigate(); const [open, setOpen] = useState(false); const [next, setNext] = useState<Trip | null>(null); const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (profile) api.listTrips(profile.id).then(ts => { const t = new Date().toISOString().slice(0, 10); setNext(ts.filter(x => x.end_date >= t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? ts[0] ?? null) }) }, [profile])
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
  if (!profile) return null
  return (
    <header style={{ background: 'var(--orange)', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', position: 'relative', zIndex: 1000, flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{ background: 'var(--white)', borderRadius: '50%', display: 'inline-flex', padding: 3 }}><Logo size={30} /></span>
        <strong style={{ fontSize: 20, whiteSpace: 'nowrap' }}>The Travel Log</strong>
      </div>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {next ? <>Next Trip: <strong>{next.name || next.place}</strong>{next.start_date ? ` — ${fmtDate(next.start_date)}` : ''}</> : 'No trips planned yet'}
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', color: 'var(--white)', fontWeight: 700, fontSize: 15 }}>
          <span>{profile.username}</span>
          {profile.avatar_url ? <img src={profile.avatar_url} alt="avatar" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' }} /> : <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#808080', border: '2px solid #fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>{profile.username[0]?.toUpperCase()}</span>}
          <span>▾</span>
        </button>
        {open && <div style={{ position: 'absolute', right: 0, top: 46, background: 'var(--white)', color: 'var(--black)', border: '1px solid var(--black)', borderRadius: 8, minWidth: 160, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: '#fff', border: 'none' }} onClick={() => { setOpen(false); nav('/') }}>Main Page</button>
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: '#fff', border: 'none', borderTop: '1px solid #ddd' }} onClick={() => { setOpen(false); nav('/settings') }}>Settings</button>
          <button style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: '#fff', border: 'none', borderTop: '1px solid #ddd' }} onClick={async () => { await logout(); nav('/login') }}>Logout</button>
        </div>}
      </div>
    </header>
  )
}
