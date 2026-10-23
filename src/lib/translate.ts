/** Free MyMemory translation for place / item display names (no API key). */

const cache = new Map<string, string>()

function cacheKey(text: string, lang: string) {
  return `${lang}::${text}`
}

/** Translate a short place/item label into the user's preferred language. */
export async function translateLabel(text: string, targetLang: string): Promise<string> {
  const cleaned = (text || '').trim()
  if (!cleaned) return ''
  const lang = (targetLang || 'en').trim() || 'en'
  if (lang === 'en' && /^[\x00-\x7F]*$/.test(cleaned)) return cleaned

  const key = cacheKey(cleaned, lang)
  const hit = cache.get(key)
  if (hit) return hit

  try {
    const stored = localStorage.getItem(`ttl-tr:${key}`)
    if (stored) {
      cache.set(key, stored)
      return stored
    }
  } catch { /* ignore */ }

  try {
    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleaned.slice(0, 450))}` +
      `&langpair=|${encodeURIComponent(lang)}`
    const res = await fetch(url)
    if (!res.ok) return cleaned
    const data = await res.json()
    const out = (data?.responseData?.translatedText as string | undefined)?.trim()
    if (!out || /INVALID|QUERY LENGTH|MYMEMORY/i.test(out)) return cleaned
    cache.set(key, out)
    try { localStorage.setItem(`ttl-tr:${key}`, out) } catch { /* ignore */ }
    return out
  } catch {
    return cleaned
  }
}

/** Batch-friendly helper used by list UIs. */
export async function translateLabels(texts: string[], targetLang: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  await Promise.all(texts.map(async t => {
    out[t] = await translateLabel(t, targetLang)
  }))
  return out
}
