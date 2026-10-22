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
