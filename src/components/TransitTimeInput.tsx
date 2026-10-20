import { useEffect, useRef, useState } from 'react'
import { formatTransitTime, parseTransitTime, isFlight } from '../lib/routing'

export default function TransitTimeInput({ minutes, mode, onChange }: { minutes: number | null; mode: string; onChange: (minutes: number | null) => void }) {
  const [text, setText] = useState(() => formatTransitTime(minutes, mode))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(formatTransitTime(minutes, mode)) }, [minutes, mode])
  const flight = isFlight(mode)
  return (
    <>
      <label>Time in Transit {flight ? '(hour:minute)' : '(minutes)'}</label>
      <input
        type={flight ? 'text' : 'number'}
        inputMode={flight ? 'numeric' : undefined}
        placeholder={flight ? '2:35' : '95'}
        value={text}
        onFocus={() => { focused.current = true }}
        onBlur={() => { focused.current = false; setText(formatTransitTime(minutes, mode)) }}
        onChange={e => { setText(e.target.value); onChange(parseTransitTime(e.target.value, mode)) }}
      />
    </>
  )
}
