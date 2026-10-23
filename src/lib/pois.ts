/** Nearby points of interest via free OpenStreetMap Overpass mirrors (no paid keys). */

import { poiTravelLinks } from './travelApps'

export type PoiCategory =
  | 'hotel'
  | 'restaurant'
  | 'cafe'
  | 'school'
  | 'museum'
  | 'hospital'
  | 'attraction'
  | 'other'

export interface MapPoi {
  id: string
  lat: number
  lng: number
  name: string
  category: PoiCategory
  label: string
}

const CATEGORY_META: Record<PoiCategory, { color: string; icon: string; title: string }> = {
  hotel: { color: '#2563EB', icon: 'H', title: 'Hotel' },
  restaurant: { color: '#DC2626', icon: 'R', title: 'Restaurant' },
  cafe: { color: '#B45309', icon: 'C', title: 'Café' },
  school: { color: '#7C3AED', icon: 'S', title: 'School' },
  museum: { color: '#0D9488', icon: 'M', title: 'Museum' },
  hospital: { color: '#E11D48', icon: '+', title: 'Hospital' },
  attraction: { color: '#F97316', icon: '★', title: 'Experience' },
  other: { color: '#6B7280', icon: '•', title: 'Place' },
}

export function poiMeta(category: PoiCategory) {
  return CATEGORY_META[category] ?? CATEGORY_META.other
}

function categorize(tags: Record<string, string> | undefined): PoiCategory {
  if (!tags) return 'other'
  if (tags.tourism === 'hotel' || tags.tourism === 'guest_house' || tags.tourism === 'hostel') return 'hotel'
  if (tags.amenity === 'restaurant' || tags.amenity === 'fast_food') return 'restaurant'
  if (tags.amenity === 'cafe' || tags.amenity === 'biergarten') return 'cafe'
  if (tags.amenity === 'school' || tags.amenity === 'university' || tags.amenity === 'college') return 'school'
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum'
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital'
  if (
    tags.tourism === 'attraction' ||
    tags.tourism === 'viewpoint' ||
    tags.tourism === 'zoo' ||
    tags.tourism === 'theme_park' ||
    tags.tourism === 'artwork' ||
    tags.leisure === 'park' ||
    tags.historic
  ) return 'attraction'
  return 'other'
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

function buildQuery(bbox: string, experiencesOnly = false) {
  if (experiencesOnly) {
    return `
[out:json][timeout:20];
(
  nwr["tourism"="attraction"](${bbox});
  nwr["tourism"="viewpoint"](${bbox});
  nwr["tourism"="museum"](${bbox});
  nwr["tourism"="gallery"](${bbox});
  nwr["tourism"="zoo"](${bbox});
  nwr["tourism"="theme_park"](${bbox});
  nwr["historic"](${bbox});
  nwr["leisure"="park"]["name"](${bbox});
);
out center 60;
`
  }
  return `
[out:json][timeout:20];
(
  nwr["tourism"~"hotel|hostel|guest_house"](${bbox});
  nwr["amenity"~"restaurant|cafe|fast_food"](${bbox});
  nwr["amenity"~"school|university|hospital"](${bbox});
  nwr["tourism"="museum"](${bbox});
  nwr["tourism"="attraction"](${bbox});
  nwr["tourism"="viewpoint"](${bbox});
);
out center 80;
`
}

function parseElements(elements: any[], placeContext: string): MapPoi[] {
  const seen = new Set<string>()
  const pois: MapPoi[] = []
  for (const el of elements ?? []) {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) continue
    const tags = el.tags || {}
    const name = tags.name || tags['name:en']
    if (!name) continue
    const category = categorize(tags)
    const id = `poi-${el.type}-${el.id}`
    if (seen.has(id)) continue
    seen.add(id)
    const meta = poiMeta(category)
    const links = poiTravelLinks(name, placeContext, category)
      .slice(0, 3)
      .map(l => `<a href="${l.url}" target="_blank" rel="noreferrer">${l.label}</a>`)
      .join(' · ')
    pois.push({
      id,
      lat,
      lng,
      name,
      category,
      label: `<b>${name}</b><br/>${meta.title}${links ? `<br/>${links}` : ''}`,
    })
    if (pois.length >= 50) break
  }
  return pois
}

async function postOverpass(query: string, signal?: AbortSignal): Promise<any[]> {
  let lastErr: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      })
      if (!res.ok) continue
      const data = await res.json()
      return data.elements ?? []
    } catch (e) {
      lastErr = e
      if ((e as any)?.name === 'AbortError') throw e
    }
  }
  if (lastErr) return []
  return []
}

/** Nominatim fallback when Overpass is slow/unavailable — still free OSM data. */
async function nominatimFallback(bounds: {
  south: number; west: number; north: number; east: number
}, signal?: AbortSignal): Promise<any[]> {
  const viewbox = `${bounds.west},${bounds.north},${bounds.east},${bounds.south}`
  const kinds = ['hotel', 'restaurant', 'museum', 'attraction', 'cafe']
  const out: any[] = []
  for (const kind of kinds) {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=8` +
        `&q=${encodeURIComponent(kind)}&viewbox=${viewbox}&bounded=1`
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
      if (!res.ok) continue
      const rows = await res.json()
      for (const r of rows) {
        out.push({
          type: 'node',
          id: `nom-${r.place_id}`,
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          tags: { name: (r.display_name || '').split(',')[0], amenity: kind, tourism: kind },
        })
      }
    } catch (e) {
      if ((e as any)?.name === 'AbortError') throw e
    }
  }
  return out
}

export async function fetchNearbyPois(
  bounds: { south: number; west: number; north: number; east: number },
  opts?: { signal?: AbortSignal; experiencesOnly?: boolean; placeContext?: string },
): Promise<MapPoi[]> {
  const { south, west, north, east } = bounds
  const bbox = `${south},${west},${north},${east}`
  const placeContext = opts?.placeContext ?? ''
  const query = buildQuery(bbox, opts?.experiencesOnly)

  let elements = await postOverpass(query, opts?.signal)
  if (elements.length === 0 && !opts?.experiencesOnly) {
    elements = await nominatimFallback(bounds, opts?.signal)
  }
  return parseElements(elements, placeContext)
}

export async function fetchExperiences(
  bounds: { south: number; west: number; north: number; east: number },
  placeContext = '',
  signal?: AbortSignal,
): Promise<MapPoi[]> {
  return fetchNearbyPois(bounds, { signal, experiencesOnly: true, placeContext })
}
