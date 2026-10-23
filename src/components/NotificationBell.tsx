import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncBookingOpenNotifications,
} from '../lib/notifications'
import type { AppNotification } from '../lib/types'

export default function NotificationBell() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<AppNotification[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await syncBookingOpenNotifications(profile)
        if (!cancelled) setNotes(list)
      } catch {
        try {
          const list = await listNotifications(profile.id)
          if (!cancelled) setNotes(list)
        } catch { /* ignore */ }
      }
    })()
    return () => { cancelled = true }
  }, [profile])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (!profile || profile.booking_alerts_enabled === false) return null

  const unread = notes.filter(n => !n.read).length

  return (
    <div ref={ref} className="notif-bell-wrap">
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="menu">
          <div className="notif-panel-head">
            <strong>Alerts</strong>
            {notes.length > 0 && (
              <button
                type="button"
                className="link-danger"
                style={{ color: 'var(--orange-hover)' }}
                onClick={async () => {
                  await markAllNotificationsRead(profile.id)
                  setNotes(prev => prev.map(n => ({ ...n, read: true })))
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          {notes.length === 0 && (
            <p className="places-hint" style={{ margin: '8px 4px' }}>No booking alerts yet.</p>
          )}
          {notes.slice(0, 12).map(n => (
            <button
              key={n.id}
              type="button"
              className={`notif-row${n.read ? '' : ' unread'}`}
              onClick={async () => {
                await markNotificationRead(n.id)
                setNotes(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
                setOpen(false)
                if (n.trip_id) nav(`/trip/${n.trip_id}`)
              }}
            >
              <span className="notif-row-title">{n.title}</span>
              <span className="notif-row-body">{n.body}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
