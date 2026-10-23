import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { translateLabel } from '../lib/translate'

/** Renders text translated into the user's Settings language preference. */
export default function TranslatedText({
  text,
  as: Tag = 'span',
  className,
  title,
}: {
  text: string
  as?: 'span' | 'div' | 'p' | 'strong' | 'h4'
  className?: string
  title?: string
}) {
  const { profile } = useAuth()
  const lang = profile?.preferred_language || 'en'
  const [out, setOut] = useState(text)

  useEffect(() => {
    let cancelled = false
    setOut(text)
    if (!text.trim() || lang === 'original') return
    translateLabel(text, lang).then(t => {
      if (!cancelled) setOut(t || text)
    })
    return () => { cancelled = true }
  }, [text, lang])

  return <Tag className={className} title={title || text}>{out}</Tag>
}
