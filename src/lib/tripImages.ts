/** Resolve a representative photo for a place (free sources, no API keys). */

export async function resolveTripImage(place: string, lat: number | null, lng: number | null): Promise<string | null> {
  return resolvePlaceImage(place, lat, lng)
}

/** Prefer a real photo of the place (Wikipedia / Commons), then a nearby Commons image. */
export async function resolvePlaceImage(
  place: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<string | null> {
  const name = (place || '').trim()
  const candidates = nameCandidates(name)

  for (const title of candidates) {
    const wiki = await wikipediaThumb(title)
    if (wiki) return wiki
  }

  if (name) {
    const commons = await commonsSearchThumb(candidates[0] || name)
    if (commons) return commons
  }

  if (lat != null && lng != null) {
    const near = await wikimediaNear(lat, lng, 2500)
    if (near) return near
  }

  return null
}

function nameCandidates(name: string): string[] {
  if (!name) return []
  const parts = name.split(',').map(p => p.trim()).filter(Boolean)
  const primary = parts[0] || name
  const out: string[] = [primary]
  // Drop trailing "Station", "Hotel", etc. noise for wiki match attempts
  const stripped = primary
    .replace(/\s*\((Check-in|Check-out)\)\s*$/i, '')
    .replace(/\s+(Hotel|Hostel|Inn|Resort|Restaurant|Café|Cafe|Museum|Park|Station|Airport)$/i, '')
    .trim()
  if (stripped && stripped !== primary) out.push(stripped)
  if (parts.length >= 2) out.push(`${primary}, ${parts[1]}`)
  return [...new Set(out)].slice(0, 4)
}

async function wikipediaThumb(title: string): Promise<string | null> {
  try {
    const slug = encodeURIComponent(title.replace(/\s+/g, '_'))
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.type === 'disambiguation') return null
    return data.thumbnail?.source || data.originalimage?.source || null
  } catch {
    return null
  }
}

async function commonsSearchThumb(query: string): Promise<string | null> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=8&gsrnamespace=6` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const pages = data.query?.pages
    if (!pages) return null
    for (const page of Object.values(pages) as any[]) {
      const title = String(page.title || '')
      if (/map|logo|icon|flag|svg|diagram|chart|coat of arms/i.test(title)) continue
      const thumb = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url
      if (thumb && /\.(jpe?g|png|webp)/i.test(thumb)) return thumb
    }
    return null
  } catch {
    return null
  }
}

async function wikimediaNear(lat: number, lng: number, radius = 2500): Promise<string | null> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch` +
      `&ggscoord=${lat}|${lng}&ggsradius=${radius}&ggslimit=8&prop=imageinfo` +
      `&iiprop=url&iiurlwidth=640&format=json&origin=*`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const pages = data.query?.pages
    if (!pages) return null
    for (const page of Object.values(pages) as any[]) {
      const title = String(page.title || '')
      if (/map|logo|icon|flag|svg|diagram|chart/i.test(title)) continue
      const thumb = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url
      if (thumb && /\.(jpe?g|png|webp)/i.test(thumb)) return thumb
    }
    return null
  } catch {
    return null
  }
}
