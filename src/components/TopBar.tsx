import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/data'
import { bookingStatusLabel, formatDateRange, tripDurationDays, type Trip } from '../lib/types'

export default function TopBar() {
  const { profile, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState<Trip | null>(null)
  const [tripCount, setTripCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profile) return
    api.listTrips(profile.id).then(ts => {
      setTripCount(ts.length)
      const today = new Date().toISOString().slice(0, 10)
      const upcoming = ts.filter(x => x.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))
      setNext(upcoming[0] ?? ts.sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null)
    })
  }, [profile])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (!profile) return null

  const duration = next ? tripDurationDays(next.start_date, next.end_date) : null
  const centerCopy = (() => {
    if (!next) {
      return tripCount === 0
        ? 'Plan your next adventure — create a trip to get started'
        : `${tripCount} trip${tripCount === 1 ? '' : 's'} saved`
    }
    const label = next.name || next.place || 'Untitled Trip'
    const where = next.place ? ` · ${next.place}` : ''
    const when = next.start_date ? ` · ${formatDateRange(next.start_date, next.end_date)}` : ''
    const days = duration ? ` · ${duration} day${duration === 1 ? '' : 's'}` : ''
    const status = ` · ${bookingStatusLabel(next.booking_status)}`
    return <>Next: <strong>{label}</strong>{where}{when}{days}{status}</>
  })()

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span style={{ background: 'var(--white)', borderRadius: '50%', display: 'inline-flex', padding: 3 }}>
          <Logo size={30} />
        </span>
        <strong>The Travel Log</strong>
      </div>
      <div className="topbar-center" title={typeof centerCopy === 'string' ? centerCopy : undefined}>
        {centerCopy}
      </div>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'transparent', border: 'none', color: 'var(--white)', fontWeight: 600, fontSize: 14, borderRadius: 8, padding: '4px 6px' }}
        >
          <span>{profile.username}</span>
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fff' }} />
            : <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#9CA3AF', border: '2px solid #fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>{profile.username[0]?.toUpperCase()}</span>}
          <span aria-hidden>▾</span>
        </button>
        {open && (
          <div className="topbar-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setOpen(false); nav('/') }}>Main Page</button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); nav('/settings') }}>Settings</button>
            <button type="button" role="menuitem" onClick={async () => { await logout(); nav('/login') }}>Logout</button>
          </div>
        )}
      </div>
    </header>
  )
}
