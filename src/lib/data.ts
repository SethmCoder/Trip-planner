import { supabase, isSupabaseConfigured } from './supabase'
import { newId, type Trip, type ItineraryItem, type Profile } from './types'

// ---------- Local (localStorage) fallback store, used only when Supabase is not configured ----------
interface LocalUser extends Profile { password: string }
interface DB { users: LocalUser[]; trips: Trip[]; items: ItineraryItem[]; sessionUserId: string | null }
const KEY = 'travel-log-db-v2'
function seed(): DB {
  return { users: [], sessionUserId: null, trips: [], items: [] }
}
function load(): DB { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) } catch {} const d = seed(); save(d); return d }
function save(d: DB) { localStorage.setItem(KEY, JSON.stringify(d)) }
const strip = (u: LocalUser): Profile => ({ id: u.id, username: u.username, email: u.email, avatar_url: u.avatar_url })

// ---------- Auth ----------
export async function getSessionProfile(): Promise<Profile | null> {
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase.auth.getSession(); if (!data.session) return null
    const { data: p } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).single(); return p ?? null
  }
  const d = load(); const u = d.users.find(x => x.id === d.sessionUserId); return u ? strip(u) : null
}
export async function login(identifier: string, password: string): Promise<Profile> {
  if (isSupabaseConfigured && supabase) {
    let email = identifier.trim()
    if (!email.includes('@')) { const { data } = await supabase.from('profiles').select('email').eq('username', email).single(); if (!data) throw new Error('User not found'); email = data.email }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw new Error(error.message)
    const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).single(); return p
  }
  const d = load(); const u = d.users.find(x => x.username.toLowerCase() === identifier.trim().toLowerCase() || x.email.toLowerCase() === identifier.trim().toLowerCase())
  if (!u || u.password !== password) throw new Error('Invalid username/email or password')
  d.sessionUserId = u.id; save(d); return strip(u)
}
export async function createAccount(email: string, username: string, password: string): Promise<Profile> {
  if (password.length < 6) throw new Error('Password must be at least 6 characters')
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({ email, password }); if (error) throw new Error(error.message)
    if (!data.user) throw new Error('Account created — please confirm your email, then log in.')
    const { error: e2 } = await supabase.from('profiles').upsert({ id: data.user.id, email, username, avatar_url: null }); if (e2) throw new Error(e2.message)
    return { id: data.user.id, email, username, avatar_url: null }
  }
  const d = load()
  if (d.users.some(x => x.username.toLowerCase() === username.toLowerCase())) throw new Error('Username already taken')
  if (d.users.some(x => x.email.toLowerCase() === email.toLowerCase())) throw new Error('Email already registered')
  const u: LocalUser = { id: newId(), username, email, password, avatar_url: null }; d.users.push(u); d.sessionUserId = u.id; save(d); return strip(u)
}
export async function requestPasswordReset(identifier: string): Promise<void> {
  const value = identifier.trim()
  if (!value) throw new Error('Enter your username or email above, then click Forgot password')
  if (isSupabaseConfigured && supabase) {
    let email = value
    if (!email.includes('@')) {
      const { data } = await supabase.from('profiles').select('email').eq('username', email).maybeSingle()
      // Don't reveal whether the account exists — send (or pretend to) either way
      if (!data?.email) return
      email = data.email
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) throw new Error(error.message)
    return
  }
  throw new Error('Password reset by email is unavailable — no email service is connected')
}
export async function updatePasswordFromRecovery(newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('Password must be at least 6 characters')
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
    return
  }
  throw new Error('Password reset by email is unavailable — no email service is connected')
}
export async function hasRecoverySession(): Promise<boolean> {
  if (isSupabaseConfigured && supabase) {
    if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) return true
    const { data } = await supabase.auth.getSession(); return Boolean(data.session)
  }
  return false
}
export async function logout(): Promise<void> {
  // All writes are persisted immediately, so logging out is inherently "saved"; flush local DB once more.
  if (isSupabaseConfigured && supabase) { await supabase.auth.signOut(); return }
  const d = load(); d.sessionUserId = null; save(d)
}
export async function verifyPassword(profile: Profile, password: string): Promise<boolean> {
  if (isSupabaseConfigured && supabase) { const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password }); return !error }
  const d = load(); return d.users.find(x => x.id === profile.id)?.password === password
}
export async function updateProfile(profile: Profile, patch: Partial<Profile> & { newPassword?: string }): Promise<Profile> {
  if (isSupabaseConfigured && supabase) {
    if (patch.newPassword) await supabase.auth.updateUser({ password: patch.newPassword })
    if (patch.email && patch.email !== profile.email) await supabase.auth.updateUser({ email: patch.email })
    const { data, error } = await supabase.from('profiles').update({ username: patch.username ?? profile.username, email: patch.email ?? profile.email, avatar_url: patch.avatar_url !== undefined ? patch.avatar_url : profile.avatar_url }).eq('id', profile.id).select().single()
    if (error) throw new Error(error.message); return data
  }
  const d = load(); const u = d.users.find(x => x.id === profile.id); if (!u) throw new Error('User not found')
  if (patch.username && d.users.some(x => x.id !== u.id && x.username.toLowerCase() === patch.username!.toLowerCase())) throw new Error('Username already taken')
  Object.assign(u, { username: patch.username ?? u.username, email: patch.email ?? u.email, avatar_url: patch.avatar_url !== undefined ? patch.avatar_url : u.avatar_url })
  if (patch.newPassword) u.password = patch.newPassword
  save(d); return strip(u)
}
const fileToDataUrl = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
export async function uploadAvatar(profile: Profile, file: File): Promise<string> {
  if (isSupabaseConfigured && supabase) {
    try {
      const path = `${profile.id}/${Date.now()}-${file.name}`; const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true }); if (error) throw error
      return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    } catch { return await fileToDataUrl(file) /* avatars bucket not created yet — store inline so the app still works */ }
  }
  return await fileToDataUrl(file)
}

// ---------- Trips / Items ----------
export async function listTrips(userId: string): Promise<Trip[]> {
  if (isSupabaseConfigured && supabase) { const { data } = await supabase.from('trips').select('*').eq('user_id', userId).order('start_date'); return data ?? [] }
  return load().trips.filter(t => t.user_id === userId).sort((a, b) => a.start_date.localeCompare(b.start_date))
}
export async function getTrip(id: string): Promise<Trip | null> {
  if (isSupabaseConfigured && supabase) { const { data } = await supabase.from('trips').select('*').eq('id', id).single(); return data ?? null }
  return load().trips.find(t => t.id === id) ?? null
}
export async function saveTrip(trip: Trip): Promise<Trip> {
  if (isSupabaseConfigured && supabase) { const { data, error } = await supabase.from('trips').upsert(trip).select().single(); if (error) throw new Error(error.message); return data }
  const d = load(); const i = d.trips.findIndex(t => t.id === trip.id); if (i >= 0) d.trips[i] = trip; else d.trips.push(trip); save(d); return trip
}
export async function deleteTrip(id: string) {
  if (isSupabaseConfigured && supabase) { await supabase.from('trips').delete().eq('id', id); return }
  const d = load(); d.trips = d.trips.filter(t => t.id !== id); d.items = d.items.filter(i => i.trip_id !== id); save(d)
}
const normalizeItem = (i: ItineraryItem): ItineraryItem => ({ ...i, booking_open_date: i.booking_open_date ?? '', book_by_date: i.book_by_date ?? '' })
export async function listItems(tripId: string): Promise<ItineraryItem[]> {
  if (isSupabaseConfigured && supabase) { const { data } = await supabase.from('itinerary_items').select('*').eq('trip_id', tripId).order('sort_order'); return (data ?? []).map(normalizeItem) }
  return load().items.filter(i => i.trip_id === tripId).sort((a, b) => a.sort_order - b.sort_order).map(normalizeItem)
}
export async function saveItem(item: ItineraryItem): Promise<ItineraryItem> {
  if (isSupabaseConfigured && supabase) {
    // Empty strings are not valid Postgres dates — send null instead
    const payload = { ...item, booking_open_date: item.booking_open_date || null, book_by_date: item.book_by_date || null }
    const { data, error } = await supabase.from('itinerary_items').upsert(payload).select().single()
    if (error) {
      // Database has not been migrated yet (booking date columns missing) — save without them rather than failing
      if (/booking_open_date|book_by_date/.test(error.message)) {
        const { booking_open_date, book_by_date, ...rest } = payload
        const retry = await supabase.from('itinerary_items').upsert(rest).select().single()
        if (retry.error) throw new Error(retry.error.message)
        console.warn('Saved without booking dates: run the latest supabase/schema.sql to enable them')
        return normalizeItem(retry.data)
      }
      throw new Error(error.message)
    }
    return normalizeItem(data)
  }
  const d = load(); const i = d.items.findIndex(x => x.id === item.id); if (i >= 0) d.items[i] = item; else d.items.push(item); save(d); return item
}
export async function saveItems(items: ItineraryItem[]) { for (const i of items) await saveItem(i) }
export async function deleteItem(id: string) {
  if (isSupabaseConfigured && supabase) { await supabase.from('itinerary_items').delete().eq('id', id); return }
  const d = load(); d.items = d.items.filter(i => i.id !== id); save(d)
}
