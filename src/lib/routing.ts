// Transit-time calculation.
// Ground modes use OSRM (OpenStreetMap's free routing engine — no API key, unlike Google Maps).
// Airplane mode does not use road routing: it uses the departure/arrival difference when available,
// otherwise a great-circle flight estimate.
export const isFlight = (mode: string) => /air|flight|plane|fly/i.test(mode || '')

export interface LatLng { lat: number; lng: number }

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export async function calculateTransitMinutes(from: LatLng | null, to: LatLng | null, mode: string, startAt?: string, endAt?: string): Promise<{ minutes: number; source: string } | null> {
  if (isFlight(mode)) {
    if (startAt && endAt) {
      const diff = Math.round((+new Date(endAt) - +new Date(startAt)) / 60000)
      if (diff > 0) return { minutes: diff, source: 'from departure/arrival times' }
    }
    if (from && to) {
      const km = haversineKm(from, to)
      return { minutes: Math.max(20, Math.round(km / 750 * 60) + 30), source: 'estimated flight time (distance)' }
    }
    return null
  }
  if (from && to) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
      const r = await fetch(url)
      const j = await r.json()
      const route = j?.routes?.[0]
      if (route?.duration) return { minutes: Math.round(route.duration / 60), source: 'route calculated with OpenStreetMap (OSRM)' }
    } catch { /* fall through to estimate */ }
    const km = haversineKm(from, to)
    return { minutes: Math.max(5, Math.round(km / 50 * 60)), source: 'estimated from distance' }
  }
  if (startAt && endAt) {
    const diff = Math.round((+new Date(endAt) - +new Date(startAt)) / 60000)
    if (diff > 0) return { minutes: diff, source: 'from departure/arrival times' }
  }
  return null
}

/** Airplane: "2:35" (hour:minute). Everything else: minutes, e.g. "95". */
export function formatTransitTime(minutes: number | null | undefined, mode: string): string {
  if (minutes == null || isNaN(minutes)) return ''
  const total = Math.round(minutes)
  if (isFlight(mode)) {
    const h = Math.floor(total / 60), m = total % 60
    return `${h}:${String(m).padStart(2, '0')}`
  }
  return String(total)
}

/** Parse an hour:minute string like "2:35" (or a plain number) into total minutes. */
export function parseTransitTime(value: string, mode: string): number | null {
  const v = value.trim(); if (!v) return null
  if (isFlight(mode) && v.includes(':')) {
    const [h, m] = v.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return null
    return h * 60 + m
  }
  const n = Number(v); return isNaN(n) ? null : Math.round(n)
}

export const addMinutes = (isoLocal: string, minutes: number): string => {
  const d = new Date(isoLocal); if (isNaN(+d)) return isoLocal
  d.setMinutes(d.getMinutes() + minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
