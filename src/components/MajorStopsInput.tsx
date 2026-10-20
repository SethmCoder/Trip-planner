import { useEffect, useRef, useState } from 'react'
import type { Stop } from '../lib/types'

export default function MajorStopsInput({ value, onChange, placeholder }: { value: Stop[]; onChange: (stops: Stop[]) => void; placeholder?: string }) {
  const toText = (stops: Stop[]) => stops.map(s => s.name).join(', ')
  const [text, setText] = useState(() => toText(value))
  const focused = useRef(false)
  // Keep local text in sync with outside changes (e.g. switching trips) — but never while typing,
  // otherwise trailing commas/spaces get stripped mid-keystroke.
  useEffect(() => { if (!focused.current) setText(toText(value)) }, [value])
  const parse = (t: string): Stop[] => {
    // Preserve any existing coordinates for stops whose names haven't changed
    const prev = new Map(value.map(s => [s.name.toLowerCase(), s]))
    return t.split(',').map(s => s.trim()).filter(Boolean).map(name => prev.get(name.toLowerCase()) ?? { name })
  }
  return (
    <input
      value={text}
      placeholder={placeholder ?? 'Stop 1, Stop 2'}
      onFocus={() => { focused.current = true }}
      onBlur={() => { focused.current = false; setText(toText(parse(text))) }}
      onChange={e => { setText(e.target.value); onChange(parse(e.target.value)) }}
    />
  )
}
