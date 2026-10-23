import type { ItineraryItem } from './types'
import { lonelyPlanetUrl, tripadvisorUrl } from './travelApps'

export function bookingLink(item: ItineraryItem): { label: string; url: string } | null {
  if (item.booking_status === 'booked') return null
  const q = encodeURIComponent(item.title || item.place_name || '')
  const query = item.title || item.place_name || ''
  if (item.type === 'hotel') return { label: 'Book on Booking.com', url: `https://www.booking.com/searchresults.html?ss=${q}` }
  if (item.type === 'restaurant') return { label: 'Reserve on OpenTable', url: `https://www.opentable.com/s/?cuisineIds%5B%5D=any&term=${q}` }
  if (item.type === 'activity') return { label: 'Book on Viator', url: `https://www.viator.com/searchResults/all?text=${q}` }
  const mode = (item.mode_of_transport || '').toLowerCase()
  if (mode.includes('train') || mode.includes('bus') || mode.includes('transit') || mode.includes('metro') || mode.includes('subway'))
    return { label: 'Book on Rome2Rio', url: `https://www.rome2rio.com/s/${encodeURIComponent(item.from_name)}/${encodeURIComponent(item.to_name)}` }
  return { label: 'Book on Expedia', url: `https://www.expedia.com/Flights-Search?trip=oneway&leg1=from:${encodeURIComponent(item.from_name)},to:${encodeURIComponent(item.to_name)}` }
}

/** Extra discovery links shown alongside the primary booking CTA. */
export function discoveryLinks(item: ItineraryItem): { label: string; url: string }[] {
  const query = item.title || item.place_name || ''
  if (!query || item.booking_status === 'booked') return []
  return [
    { label: 'TripAdvisor', url: tripadvisorUrl(query) },
    { label: 'Lonely Planet', url: lonelyPlanetUrl(query) },
  ]
}
