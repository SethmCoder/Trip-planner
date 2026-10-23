import { useState } from 'react'
import TopBar from '../components/TopBar'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/data'
import { LANGUAGE_OPTIONS, type DisplayLanguage } from '../lib/types'
import { requestBrowserNotifyPermission } from '../lib/notifications'

const PRESETS = ['✈️', '🧳', '🗺️', '🌍', '🏖️', '⛰️', '🚆', '📸'].map((e, i) => ({
  e,
  url: `https://api.dicebear.com/9.x/adventurer/svg?seed=travel${i}`,
}))

export default function SettingsPage() {
  const { profile, setProfile } = useAuth()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [email, setEmail] = useState(profile?.email ?? '')
  const [origPw, setOrigPw] = useState('')
  const [origPw2, setOrigPw2] = useState('')
  const [newPw, setNewPw] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [alerts, setAlerts] = useState(profile?.booking_alerts_enabled !== false)
  const [lang, setLang] = useState<string>(profile?.preferred_language || 'en')

  if (!profile) return null

  const flash = (m: string) => { setMsg(m); setErr('') }

  const saveIdentity = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!(await api.verifyPassword(profile, origPw))) throw new Error('Original password is incorrect')
      setProfile(await api.updateProfile(profile, { username, email }))
      flash('Username/email updated.')
    } catch (x: any) {
      setErr(x.message)
    }
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (!(await api.verifyPassword(profile, origPw2))) throw new Error('Original password is incorrect')
      if (newPw.length < 6) throw new Error('New password must be at least 6 characters')
      setProfile(await api.updateProfile(profile, { newPassword: newPw }))
      setNewPw('')
      setOrigPw2('')
      flash('Password changed.')
    } catch (x: any) {
      setErr(x.message)
    }
  }

  const handleFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const url = await api.uploadAvatar(profile, f)
      setProfile(await api.updateProfile(profile, { avatar_url: url }))
      flash('Avatar updated.')
    } catch (x: any) {
      setErr(x.message)
    }
  }

  const savePrefs = async () => {
    try {
      const next = await api.updateProfile(profile, {
        booking_alerts_enabled: alerts,
        preferred_language: lang as DisplayLanguage,
      })
      setProfile(next)
      if (alerts) {
        const perm = await requestBrowserNotifyPermission()
        if (perm === 'denied') {
          flash('Preferences saved. Browser notifications are blocked — you’ll still see alerts in the app.')
          return
        }
      }
      flash('Preferences saved.')
    } catch (x: any) {
      setErr(x.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopBar />
      <main style={{ maxWidth: 760, width: '94vw', margin: '24px auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 style={{ fontFamily: "'Courier New',monospace", margin: 0 }}>Settings</h1>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Notifications</h3>
          <p className="places-hint" style={{ marginTop: 0 }}>
            When an itinerary item has a booking-window open date and that day arrives, you’ll get an alert
            (in the app, and as a browser notification if allowed). Requires running the latest Supabase schema for cloud sync.
          </p>
          <label className="places-toggle" style={{ justifyContent: 'space-between', width: '100%' }}>
            <span>Booking window alerts</span>
            <span className="toggle">
              <input
                type="checkbox"
                checked={alerts}
                onChange={e => setAlerts(e.target.checked)}
              />
              <span className="slider" />
            </span>
          </label>
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Display language</h3>
          <p className="places-hint" style={{ marginTop: 0 }}>
            Place and item names are translated into this language when shown on trip cards and lists.
            Original names stay stored as you entered them.
          </p>
          <label htmlFor="pref-lang">Language for place names</label>
          <select id="pref-lang" value={lang} onChange={e => setLang(e.target.value)}>
            {LANGUAGE_OPTIONS.map(o => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </select>
          <button type="button" className="btn-orange" style={{ marginTop: 14 }} onClick={savePrefs}>
            Save preferences
          </button>
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Avatar</h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--black)' }} />
              : <span style={{ width: 80, height: 80, borderRadius: '50%', background: '#808080', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32 }}>{profile.username[0]?.toUpperCase()}</span>}
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
              onClick={() => document.getElementById('avatar-file')?.click()}
              style={{ flex: 1, border: `2px dashed ${drag ? 'var(--orange)' : 'var(--black)'}`, borderRadius: 10, padding: 20, textAlign: 'center', cursor: 'pointer' }}
            >
              Drag &amp; drop your own avatar here, or click to browse
              <input id="avatar-file" type="file" accept="image/*" hidden onChange={e => handleFile(e.target.files?.[0])} />
            </div>
          </div>
          <label>Common Pictures</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {PRESETS.map(p => (
              <button
                key={p.url}
                type="button"
                title={p.e}
                onClick={async () => {
                  setProfile(await api.updateProfile(profile, { avatar_url: p.url }))
                  flash('Avatar updated.')
                }}
                style={{ border: profile.avatar_url === p.url ? '3px solid var(--orange)' : '1px solid var(--black)', borderRadius: '50%', padding: 2, background: '#fff' }}
              >
                <img src={p.url} alt="" style={{ width: 52, height: 52, borderRadius: '50%' }} />
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Change Username &amp; Email</h3>
          <form onSubmit={saveIdentity}>
            <label>New Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required />
            <label>New Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <label>Original Password (required)</label>
            <input type="password" value={origPw} onChange={e => setOrigPw(e.target.value)} required />
            <button className="btn-orange" style={{ marginTop: 14 }}>Save Username / Email</button>
          </form>
        </section>

        <section className="panel">
          <h3 style={{ marginTop: 0 }}>Change Password</h3>
          <form onSubmit={savePassword}>
            <label>Original Password (required)</label>
            <input type="password" value={origPw2} onChange={e => setOrigPw2(e.target.value)} required />
            <label>New Password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6} />
            <button className="btn-orange" style={{ marginTop: 14 }}>Change Password</button>
          </form>
        </section>

        {msg && <div className="success">{msg}</div>}
        {err && <div className="error">{err}</div>}
      </main>
    </div>
  )
}
