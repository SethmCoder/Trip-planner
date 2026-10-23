import { supabase, isSupabaseConfigured } from './supabase'
import { newId, type AppNotification, type ItineraryItem, type Profile } from './types'
import * as api from './data'

const LOCAL_KEY = 'travel-log-notifications-v1'

function loadLocal(): AppNotification[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch {
    return []
  }
}
function saveLocal(list: AppNotification[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) {
      if (/notifications|schema cache|does not exist/i.test(error.message)) return loadLocal().filter(n => n.user_id === userId)
      throw new Error(error.message)
    }
    return data ?? []
  }
  return loadLocal().filter(n => n.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
    if (error && !/notifications|schema cache|does not exist/i.test(error.message)) throw new Error(error.message)
  }
  const list = loadLocal().map(n => n.id === id ? { ...n, read: true } : n)
  saveLocal(list)
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId)
  }
  saveLocal(loadLocal().map(n => n.user_id === userId ? { ...n, read: true } : n))
}

async function insertNotification(n: AppNotification): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('notifications').insert(n)
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return
      if (/notifications|schema cache|does not exist/i.test(error.message)) {
        const list = loadLocal()
        if (!list.some(x => x.user_id === n.user_id && x.kind === n.kind && x.item_id === n.item_id)) {
          list.unshift(n)
          saveLocal(list)
        }
        return
      }
      throw new Error(error.message)
    }
    return
  }
  const list = loadLocal()
  if (list.some(x => x.user_id === n.user_id && x.kind === n.kind && x.item_id === n.item_id)) return
  list.unshift(n)
  saveLocal(list)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Scan itinerary items for booking windows that have opened and create notifications.
 * Also tries the Supabase RPC when available. Respects profile.booking_alerts_enabled.
 */
export async function syncBookingOpenNotifications(profile: Profile): Promise<AppNotification[]> {
  if (profile.booking_alerts_enabled === false) return listNotifications(profile.id)

  // Prefer server-side generator when the latest schema is applied
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.rpc('generate_booking_open_notifications')
    } catch { /* function may not exist yet */ }
  }

  const trips = await api.listTrips(profile.id)
  const today = todayISO()
  const existing = await listNotifications(profile.id)
  const known = new Set(
    existing.filter(n => n.kind === 'booking_open' && n.item_id).map(n => n.item_id as string),
  )

  for (const trip of trips) {
    let items: ItineraryItem[] = []
    try {
      items = await api.listItems(trip.id)
    } catch {
      continue
    }
    for (const it of items) {
      if (!it.booking_open_date) continue
      if (it.booking_open_date > today) continue
      if (it.booking_status === 'booked') continue
      if (known.has(it.id)) continue
      const n: AppNotification = {
        id: newId(),
        user_id: profile.id,
        title: 'Booking window open',
        body: `${it.title || 'An itinerary item'} — booking is now open${trip.name ? ` (${trip.name})` : ''}.`,
        kind: 'booking_open',
        item_id: it.id,
        trip_id: trip.id,
        read: false,
        created_at: new Date().toISOString(),
      }
      await insertNotification(n)
      known.add(it.id)
      maybeBrowserNotify(n.title, n.body)
    }
  }

  return listNotifications(profile.id)
}

function maybeBrowserNotify(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body }) } catch { /* ignore */ }
  }
}

export async function requestBrowserNotifyPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission
  return Notification.requestPermission()
}
