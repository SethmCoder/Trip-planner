export type BookingStatus = 'not_booked' | 'partially_booked' | 'booked'
export type ItemType = 'transit' | 'hotel' | 'activity' | 'restaurant'
export interface Profile { id: string; username: string; email: string; avatar_url: string | null }
export interface Stop { name: string; lat?: number; lng?: number }
export interface Trip {
  id: string; user_id: string; name: string; place: string; place_lat: number | null; place_lng: number | null
  start_date: string; end_date: string; major_stops: Stop[]; booking_status: BookingStatus; created_at: string
}
export interface ItineraryItem {
  id: string; trip_id: string; user_id: string; type: ItemType; group_id: string | null; subtype?: string | null
  title: string; place_name: string; lat: number | null; lng: number | null
  from_name: string; from_lat: number | null; from_lng: number | null; to_name: string; to_lat: number | null; to_lng: number | null
  start_at: string; end_at: string; duration_minutes: number | null; mode_of_transport: string
  booking_status: BookingStatus; booking_open_date: string; book_by_date: string; image_url: string; sort_order: number; created_at: string
}
export const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now())
export const fmtDate = (d: string) => d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''
export const bookingStatusLabel = (s: BookingStatus) =>
  s === 'booked' ? 'Booked' : s === 'partially_booked' ? 'Partially Booked' : 'Not Booked'
export const tripDurationDays = (start: string, end: string) => {
  if (!start || !end) return null
  const a = new Date(start + 'T12:00:00')
  const b = new Date(end + 'T12:00:00')
  if (Number.isNaN(+a) || Number.isNaN(+b) || b < a) return null
  return Math.round((+b - +a) / 86400000) + 1
}
export const formatDateRange = (start: string, end: string) => {
  if (!start && !end) return 'Dates TBD'
  if (start && end && start === end) return fmtDate(start)
  if (start && end) return `${fmtDate(start)} – ${fmtDate(end)}`
  return fmtDate(start || end)
}
/** Satellite tile thumbnail from the same Esri imagery used on the map (only when coords exist). */
export const destinationThumbUrl = (lat: number, lng: number, zoom = 11) => {
  const n = 2 ** zoom
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`
}
