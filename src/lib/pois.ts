/** Nearby points of interest via the free OpenStreetMap Overpass API (no paid keys). */

export type PoiCategory = 'hotel' | 'restaurant' | 'cafe' | 'school' | 'museum' | 'hospital' | 'other'

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
  return 'other'
}

export async function fetchNearbyPois(bounds: {
  south: number
  west: number
  north: number
  east: number
}, signal?: AbortSignal): Promise<MapPoi[]> {
  const { south, west, north, east } = bounds
  // Keep queries small so Overpass stays responsive
  const bbox = `${south},${west},${north},${east}`
  const query = `
[out:json][timeout:12];
(
  node["tourism"~"hotel|hostel|guest_house"](${bbox});
  node["amenity"~"restaurant|cafe|fast_food|school|university|hospital"](${bbox});
  node["tourism"="museum"](${bbox});
);
out body 50;
`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal,
    })
    if (!res.ok) return []
    const data = await res.json()
    const seen = new Set<string>()
    const pois: MapPoi[] = []
    for (const el of data.elements ?? []) {
      if (el.type !== 'node' || el.lat == null || el.lon == null) continue
      const tags = el.tags || {}
      const name = tags.name || tags['name:en']
      if (!name) continue
      const category = categorize(tags)
      const id = `poi-${el.id}`
      if (seen.has(id)) continue
      seen.add(id)
      const meta = poiMeta(category)
      pois.push({
        id,
        lat: el.lat,
        lng: el.lon,
        name,
        category,
        label: `<b>${name}</b><br/>${meta.title}`,
      })
      if (pois.length >= 40) break
    }
    return pois
  } catch {
    return []
  }
}
