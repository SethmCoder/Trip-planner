/** Deep links into travel apps / sites (no paid partner APIs required). */

export type TravelLink = { id: string; label: string; url: string; blurb: string }

function q(s: string) {
  return encodeURIComponent(s.trim())
}

export function destinationTravelLinks(place: string): TravelLink[] {
  if (!place.trim()) return []
  const term = q(place)
  return [
    {
      id: 'tripadvisor',
      label: 'TripAdvisor',
      url: `https://www.tripadvisor.com/Search?q=${term}`,
      blurb: 'Reviews, hotels, restaurants & experiences',
    },
    {
      id: 'lonelyplanet',
      label: 'Lonely Planet',
      url: `https://www.lonelyplanet.com/search?q=${term}`,
      blurb: 'Guides, itineraries & destination tips',
    },
    {
      id: 'viator',
      label: 'Viator',
      url: `https://www.viator.com/searchResults/all?text=${term}`,
      blurb: 'Book tours and experiences',
    },
    {
      id: 'getyourguide',
      label: 'GetYourGuide',
      url: `https://www.getyourguide.com/s/?q=${term}`,
      blurb: 'Activities and attraction tickets',
    },
    {
      id: 'booking',
      label: 'Booking.com',
      url: `https://www.booking.com/searchresults.html?ss=${term}`,
      blurb: 'Hotels and stays',
    },
    {
      id: 'opentable',
      label: 'OpenTable',
      url: `https://www.opentable.com/s/?term=${term}`,
      blurb: 'Restaurant reservations',
    },
  ]
}

export function poiTravelLinks(name: string, placeContext: string, category: string): TravelLink[] {
  const query = [name, placeContext].filter(Boolean).join(' ')
  const term = q(query || name)
  const links: TravelLink[] = [
    {
      id: 'tripadvisor',
      label: 'TripAdvisor',
      url: `https://www.tripadvisor.com/Search?q=${term}`,
      blurb: 'Reviews & photos',
    },
  ]
  if (category === 'attraction' || category === 'museum' || category === 'activity' || category === 'other') {
    links.push({
      id: 'lonelyplanet',
      label: 'Lonely Planet',
      url: `https://www.lonelyplanet.com/search?q=${term}`,
      blurb: 'Travel guide',
    })
    links.push({
      id: 'viator',
      label: 'Book experience',
      url: `https://www.viator.com/searchResults/all?text=${term}`,
      blurb: 'Tours & tickets',
    })
  }
  if (category === 'restaurant' || category === 'cafe') {
    links.push({
      id: 'opentable',
      label: 'OpenTable',
      url: `https://www.opentable.com/s/?term=${term}`,
      blurb: 'Reserve a table',
    })
  }
  if (category === 'hotel') {
    links.push({
      id: 'booking',
      label: 'Booking.com',
      url: `https://www.booking.com/searchresults.html?ss=${term}`,
      blurb: 'Check availability',
    })
  }
  return links
}

export function tripadvisorUrl(query: string) {
  return `https://www.tripadvisor.com/Search?q=${q(query)}`
}

export function lonelyPlanetUrl(query: string) {
  return `https://www.lonelyplanet.com/search?q=${q(query)}`
}
