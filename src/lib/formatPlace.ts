/** Compress long geocoder / OSM addresses down to a short label. */
export function shortAddress(value: string | null | undefined, maxParts = 2): string {
  if (!value) return ''
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) return truncate(parts[0] || cleaned, 48)
  return truncate(parts.slice(0, maxParts).join(', '), 56)
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
