import { bookingStatusLabel, type BookingStatus } from '../lib/types'

export default function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`status-badge ${status}`}>{bookingStatusLabel(status)}</span>
}
