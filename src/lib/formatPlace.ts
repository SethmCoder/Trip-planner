/** Compress long geocoder / OSM addresses down to a short label. */
export function shortAddress(value: string | null | undefined, maxParts = 2): string {
  if (!value) return ''
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) return truncate(parts[0] || cleaned, 40)
  return truncate(parts.slice(0, maxParts).join(', '), 48)
}

/** First comma segment only — good for list titles / map labels. */
export function placePrimary(value: string | null | undefined): string {
  if (!value) return ''
  const first = value.split(',')[0]?.trim() || value.trim()
  return truncate(first, 36)
}

/** City / region line from a long display name (skips the primary name). */
export function placeSecondary(value: string | null | undefined): string {
  if (!value) return ''
  const parts = value.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) return ''
  // Prefer last 1–2 meaningful parts (usually city + country)
  const tail = parts.slice(1).filter(p => !/^\d+$/.test(p) && !/^[A-Z0-9]{2,4}$/i.test(p))
  if (tail.length === 0) return shortAddress(parts.slice(1).join(', '), 2)
  if (tail.length === 1) return truncate(tail[0], 36)
  return truncate(`${tail[0]}, ${tail[tail.length - 1]}`, 40)
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

export function hotelStayTitle(title: string) {
  return title.replace(/\s*\((Check-in|Check-out)\)\s*$/i, '').trim() || 'Hotel'
}

export function hotelPhase(subtype?: string | null) {
  if (subtype === 'checkout') return 'Check-out'
  if (subtype === 'checkin') return 'Check-in'
  return 'Stay'
}
