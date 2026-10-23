import { useEffect, useState } from 'react'
import { destinationThumbUrl } from '../lib/types'

function initials(place: string, name: string) {
  const src = (place || name || '?').trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export default function DestinationThumb({
  place,
  name,
  lat,
  lng,
  size = 44,
  className = 'trip-thumb',
}: {
  place: string
  name: string
  lat: number | null
  lng: number | null
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [lat, lng])
  const url = lat != null && lng != null && !failed ? destinationThumbUrl(lat, lng) : null
  return (
    <div className={className} style={{ width: size, height: size }} aria-hidden>
      {url
        ? <img src={url} alt="" onError={() => setFailed(true)} />
        : initials(place, name)}
    </div>
  )
}
