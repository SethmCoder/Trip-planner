/** Deep links to Google Maps (no API key required). */

export function googleMapsUrl(opts: { lat?: number | null; lng?: number | null; name?: string }) {
  const { lat, lng, name } = opts
  if (name && lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} @${lat},${lng}`)}`
  }
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`
  }
  if (name) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`
  return 'https://www.google.com/maps'
}

export function googleMapsDirectionsUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}`
}

export function mapsLinkHtml(lat: number, lng: number, name: string) {
  const url = googleMapsUrl({ lat, lng, name })
  return `<a class="map-popup-link" href="${url}" target="_blank" rel="noreferrer">Open in Google Maps</a>`
}
