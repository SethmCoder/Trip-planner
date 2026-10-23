/** Resolve a representative photo for a trip destination (free sources, no API keys). */

export async function resolveTripImage(place: string, lat: number | null, lng: number | null): Promise<string | null> {
  const name = place.trim()
  if (name) {
    const wiki = await wikipediaThumb(name)
    if (wiki) return wiki
  }
  if (lat != null && lng != null) {
    const near = await wikimediaNear(lat, lng)
    if (near) return near
  }
  return null
}

async function wikipediaThumb(title: string): Promise<string | null> {
  try {
    const slug = encodeURIComponent(title.replace(/\s+/g, '_'))
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.thumbnail?.source || data.originalimage?.source || null
  } catch {
    return null
  }
}

async function wikimediaNear(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch` +
      `&ggscoord=${lat}|${lng}&ggsradius=8000&ggslimit=5&prop=imageinfo` +
      `&iiprop=url&iiurlwidth=800&format=json&origin=*`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const pages = data.query?.pages
    if (!pages) return null
    for (const page of Object.values(pages) as any[]) {
      const thumb = page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url
      if (thumb && /\.(jpe?g|png|webp)/i.test(thumb)) return thumb
    }
    return null
  } catch {
    return null
  }
}
