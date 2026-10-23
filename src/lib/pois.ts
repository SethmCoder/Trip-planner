/** Nearby points of interest via free OpenStreetMap Overpass mirrors (no paid keys). */

import { poiTravelLinks } from './travelApps'
import { googleMapsUrl } from './maps'

export type PoiCategory =
  | 'train_station'
  | 'hotel'
  | 'museum'
  | 'shrine'
  | 'restaurant'
  | 'cafe'
  | 'monument'
  | 'beach'
  | 'park'
  | 'stadium'
  | 'hospital'
  | 'school'
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

const CATEGORY_META: Record<PoiCategory, { color: string; emoji: string; title: string }> = {
  train_station: { color: '#0EA5E9', emoji: '🚅', title: 'Train station' },
  hotel: { color: '#2563EB', emoji: '🛏️', title: 'Hotel' },
  museum: { color: '#0D9488', emoji: '🏛️', title: 'Museum' },
  shrine: { color: '#DC2626', emoji: '⛩️', title: 'Shrine' },
  restaurant: { color: '#EA580C', emoji: '🍽️', title: 'Restaurant' },
  cafe: { color: '#B45309', emoji: '☕', title: 'Café' },
  monument: { color: '#78716C', emoji: '🗿', title: 'Monument' },
  beach: { color: '#06B6D4', emoji: '🏖️', title: 'Beach' },
  park: { color: '#16A34A', emoji: '🌴', title: 'Park' },
  stadium: { color: '#7C3AED', emoji: '🏟️', title: 'Stadium' },
  hospital: { color: '#E11D48', emoji: '🏥', title: 'Hospital' },
  school: { color: '#6366F1', emoji: '🏫', title: 'School' },
  attraction: { color: '#F97316', emoji: '★', title: 'Experience' },
  other: { color: '#6B7280', emoji: '📍', title: 'Place' },
}

/** Resolve emoji for a POI category or itinerary item kind. */
export function emojiForKind(kind?: string | null): string {
  if (!kind) return '📍'
  const k = kind.toLowerCase()
  if (k in CATEGORY_META) return CATEGORY_META[k as PoiCategory].emoji
  if (k === 'transit') return '🚅'
  if (k === 'activity' || k === 'destination') return '📍'
  return '📍'
}

export function poiMeta(category: string) {
  return CATEGORY_META[category as PoiCategory] ?? CATEGORY_META.other
}

export function categorize(tags: Record<string, string> | undefined): PoiCategory {
  if (!tags) return 'other'
  if (
    tags.railway === 'station' ||
    tags.railway === 'halt' ||
    tags.public_transport === 'station' ||
    tags.amenity === 'bus_station' ||
    tags.building === 'train_station'
  ) return 'train_station'
  if (tags.tourism === 'hotel' || tags.tourism === 'guest_house' || tags.tourism === 'hostel') return 'hotel'
  if (tags.tourism === 'museum' || tags.tourism === 'gallery') return 'museum'
  if (
    tags.tourism === 'shrine' ||
    tags.building === 'shrine' ||
    tags.historic === 'shrine' ||
    (tags.amenity === 'place_of_worship' && (tags.religion === 'shinto' || tags.religion === 'buddhist'))
  ) return 'shrine'
  if (tags.amenity === 'restaurant' || tags.amenity === 'fast_food') return 'restaurant'
  if (tags.amenity === 'cafe' || tags.amenity === 'biergarten') return 'cafe'
  if (
    tags.historic === 'monument' ||
    tags.historic === 'memorial' ||
    tags.historic === 'wayside_shrine' ||
    tags.memorial ||
    (tags.tourism === 'artwork' && tags.artwork_type === 'statue')
  ) return 'monument'
  if (tags.natural === 'beach' || tags.leisure === 'beach_resort') return 'beach'
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.leisure === 'nature_reserve') return 'park'
  if (tags.leisure === 'stadium' || tags.building === 'stadium') return 'stadium'
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic') return 'hospital'
  if (tags.amenity === 'school' || tags.amenity === 'university' || tags.amenity === 'college') return 'school'
  if (
    tags.tourism === 'attraction' ||
    tags.tourism === 'viewpoint' ||
    tags.tourism === 'zoo' ||
    tags.tourism === 'theme_park' ||
    tags.tourism === 'artwork' ||
    tags.historic
  ) return 'attraction'
  return 'other'
}

/** Map itinerary item type → saved-place / pin category. */
export function categoryFromItemType(type: string, modeOfTransport?: string | null): PoiCategory {
  if (type === 'hotel') return 'hotel'
  if (type === 'restaurant') return 'restaurant'
  if (type === 'transit') {
    const m = (modeOfTransport || '').toLowerCase()
    if (m.includes('plane') || m.includes('flight') || m.includes('air')) return 'attraction'
    return 'train_station'
  }
  if (type === 'activity') return 'attraction'
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
  nwr["tourism"="shrine"](${bbox});
  nwr["historic"](${bbox});
  nwr["leisure"="park"]["name"](${bbox});
  nwr["natural"="beach"](${bbox});
  nwr["leisure"="stadium"](${bbox});
);
out center 60;
`
  }
  return `
[out:json][timeout:20];
(
  nwr["tourism"~"hotel|hostel|guest_house"](${bbox});
  nwr["amenity"~"restaurant|cafe|fast_food|hospital|clinic"](${bbox});
  nwr["amenity"~"school|university"](${bbox});
  nwr["tourism"="museum"](${bbox});
  nwr["tourism"="attraction"](${bbox});
  nwr["tourism"="viewpoint"](${bbox});
  nwr["tourism"="shrine"](${bbox});
  nwr["railway"="station"](${bbox});
  nwr["public_transport"="station"](${bbox});
  nwr["historic"~"monument|memorial"](${bbox});
  nwr["natural"="beach"](${bbox});
  nwr["leisure"="park"]["name"](${bbox});
  nwr["leisure"="stadium"](${bbox});
  nwr["amenity"="place_of_worship"]["religion"~"shinto|buddhist"](${bbox});
);
out center 80;
`
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

function popupHtml(name: string, category: PoiCategory, lat: number, lng: number, placeContext: string, opts?: { savable?: boolean; pinId?: string }) {
  const meta = poiMeta(category)
  const maps = googleMapsUrl({ lat, lng, name })
  const links = poiTravelLinks(name, placeContext, category)
    .slice(0, 2)
    .map(l => `<a href="${l.url}" target="_blank" rel="noreferrer">${l.label}</a>`)
    .join(' · ')
  const saveAttrs = opts?.pinId
    ? `data-save-pin="${escapeAttr(opts.pinId)}"`
    : `data-save-lat="${lat}" data-save-lng="${lng}" data-save-name="${escapeAttr(name)}" data-save-category="${category}"`
  const saveBtn = opts?.savable !== false
    ? `<button type="button" class="map-popup-btn map-save-btn" ${saveAttrs}>Add to saved list</button>`
    : ''
  return [
    `<div class="map-popup">`,
    `<div class="map-popup-title">${meta.emoji} <b>${escapeHtml(name)}</b></div>`,
    `<div class="map-popup-cat">${meta.title}</div>`,
    links ? `<div class="map-popup-links">${links}</div>` : '',
    `<div class="map-popup-actions">`,
    `<a class="map-popup-link" href="${maps}" target="_blank" rel="noreferrer">Open in Google Maps</a>`,
    saveBtn,
    `</div>`,
    `</div>`,
  ].join('')
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
    pois.push({
      id,
      lat,
      lng,
      name,
      category,
      label: popupHtml(name, category, lat, lng, placeContext, { pinId: id }),
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
  const kinds: { q: string; tags: Record<string, string> }[] = [
    { q: 'hotel', tags: { tourism: 'hotel' } },
    { q: 'restaurant', tags: { amenity: 'restaurant' } },
    { q: 'museum', tags: { tourism: 'museum' } },
    { q: 'train station', tags: { railway: 'station' } },
    { q: 'park', tags: { leisure: 'park' } },
    { q: 'shrine', tags: { tourism: 'shrine' } },
  ]
  const out: any[] = []
  for (const kind of kinds) {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&limit=6` +
        `&q=${encodeURIComponent(kind.q)}&viewbox=${viewbox}&bounded=1`
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal })
      if (!res.ok) continue
      const rows = await res.json()
      for (const r of rows) {
        out.push({
          type: 'node',
          id: `nom-${r.place_id}`,
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          tags: { name: (r.display_name || '').split(',')[0], ...kind.tags },
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

/** Build a pin popup for itinerary / saved-place markers. */
export function buildPinPopup(opts: {
  title?: string
  name?: string
  category?: string
  place?: string
  detail?: string
  lat: number
  lng: number
  savable?: boolean
  pinId?: string
}) {
  const name = opts.title || opts.name || 'Place'
  const detail = opts.place || opts.detail
  const category = (opts.category || 'other') as PoiCategory
  const meta = poiMeta(category)
  const maps = googleMapsUrl({ lat: opts.lat, lng: opts.lng, name })
  const saveAttrs = opts.pinId
    ? `data-save-pin="${escapeAttr(opts.pinId)}"`
    : `data-save-lat="${opts.lat}" data-save-lng="${opts.lng}" data-save-name="${escapeAttr(name)}" data-save-category="${category}" data-save-place="${escapeAttr(detail || name)}"`
  const saveBtn = opts.savable
    ? `<button type="button" class="map-popup-btn map-save-btn" ${saveAttrs}>Add to saved list</button>`
    : ''
  return [
    `<div class="map-popup">`,
    `<div class="map-popup-title">${meta.emoji} <b>${escapeHtml(name)}</b></div>`,
    `<div class="map-popup-cat">${meta.title}${detail ? ` · ${escapeHtml(detail)}` : ''}</div>`,
    `<div class="map-popup-actions">`,
    `<a class="map-popup-link" href="${maps}" target="_blank" rel="noreferrer">Open in Google Maps</a>`,
    saveBtn,
    `</div>`,
    `</div>`,
  ].join('')
}

/** Hotels near a destination (Overpass / Nominatim, free). */
export async function fetchHotelsNearby(
  bounds: { south: number; west: number; north: number; east: number },
  placeContext = '',
  signal?: AbortSignal,
): Promise<MapPoi[]> {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
  const query = `
[out:json][timeout:20];
(
  nwr["tourism"~"hotel|hostel|guest_house"](${bbox});
);
out center 40;
`
  const elements = await postOverpass(query, signal)
  const all = parseElements(elements, placeContext)
  return all.filter(p => p.category === 'hotel').slice(0, 30)
}
