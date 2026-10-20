export interface GeoResult { name: string; display: string; lat: number; lng: number }
export async function searchPlaces(q: string): Promise<GeoResult[]> {
  if (!q.trim()) return []
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
    const j = await r.json()
    return j.map((x: any) => ({ name: x.display_name.split(',')[0], display: x.display_name, lat: parseFloat(x.lat), lng: parseFloat(x.lon) }))
  } catch { return [] }
}
