import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import MapView from '../components/MapView'
import MajorStopsInput from '../components/MajorStopsInput'
import TransitTimeInput from '../components/TransitTimeInput'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/data'
import { searchPlaces, type GeoResult } from '../lib/geocoding'
import { bookingLink } from '../lib/bookingLinks'
import { newId, fmtDate, type Trip, type ItineraryItem } from '../lib/types'
import { calculateTransitMinutes, formatTransitTime, parseTransitTime, isFlight, addMinutes, getQuickestRoute, estimateGapTravel, formatCompactDuration, type LatLng, type GapTravel } from '../lib/routing'

const baseItem = (trip: Trip, userId: string, order: number): ItineraryItem => ({ id: newId(), trip_id: trip.id, user_id: userId, type: 'activity', group_id: null, title: '', place_name: '', lat: trip.place_lat, lng: trip.place_lng, from_name: '', from_lat: null, from_lng: null, to_name: '', to_lat: null, to_lng: null, start_at: `${trip.start_date}T09:00`, end_at: `${trip.start_date}T10:00`, duration_minutes: 60, mode_of_transport: '', booking_status: 'not_booked', booking_open_date: '', book_by_date: '', image_url: '', sort_order: order, created_at: new Date().toISOString() })
function PlaceSearch({ label, onPick }: { label: string; onPick: (r: GeoResult) => void }) {
  const [q, setQ] = useState(''); const [res, setRes] = useState<GeoResult[]>([]); const [picked, setPicked] = useState('')
  return <div><label>{label}</label><input value={picked || q} onChange={async e => { setPicked(''); setQ(e.target.value); if (e.target.value.length > 2) setRes(await searchPlaces(e.target.value)); else setRes([]) }} placeholder="Search a place…" />
    {res.length > 0 && <div style={{ border: '1px solid #999', borderRadius: 6, maxHeight: 130, overflowY: 'auto', background: '#fff' }}>{res.map((r, i) => <button key={i} style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', padding: '7px 9px', fontSize: 12 }} onClick={() => { onPick(r); setPicked(r.name); setRes([]) }}>{r.display}</button>)}</div>}</div>
}

export default function TripPage() {
  const { id } = useParams(); const { profile } = useAuth(); const nav = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null); const [items, setItems] = useState<ItineraryItem[]>([])
  const [divide, setDivide] = useState(false); const [dragId, setDragId] = useState<string | null>(null); const [expandedId, setExpandedId] = useState<string | null>(null)
  const [from, setFrom] = useState<GeoResult | null>(null); const [to, setTo] = useState<GeoResult | null>(null); const [mode, setMode] = useState('Airplane')
  const [tStart, setTStart] = useState(''); const [tEnd, setTEnd] = useState('')
  const [hotel, setHotel] = useState<GeoResult | null>(null); const [hIn, setHIn] = useState(''); const [hOut, setHOut] = useState('')
  const [act, setAct] = useState<GeoResult | null>(null); const [aTime, setATime] = useState('')
  const [rest, setRest] = useState<GeoResult | null>(null); const [rTime, setRTime] = useState('')
  useEffect(() => { if (id) { api.getTrip(id).then(t => { setTrip(t); if (t) { setTStart(`${t.start_date}T09:00`); setTEnd(`${t.start_date}T11:00`); setHIn(`${t.start_date}T15:00`); setHOut(`${t.end_date}T11:00`); setATime(`${t.start_date}T10:00`); setRTime(`${t.start_date}T19:00`) } }); api.listItems(id).then(setItems) } }, [id])
  // NOTE: all hooks must run before any early return, or React crashes ("rendered more hooks") to a blank screen when the trip loads
  const days = useMemo(() => { const out: string[] = []; if (!trip) return out; if (trip.start_date && trip.end_date) { const d = new Date(trip.start_date + 'T12:00:00'); const end = new Date(trip.end_date + 'T12:00:00'); while (d <= end && out.length < 60) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) } } return out.length ? out : [trip.start_date] }, [trip])
  // Quickest-route geometry for each transit leg, fetched from OSRM and drawn on the map
  const [routePaths, setRoutePaths] = useState<Record<string, LatLng[]>>({})
  const transitSignature = items.filter(i => i.type === 'transit' && i.from_lat != null && i.to_lat != null).map(i => `${i.id}:${i.from_lat},${i.from_lng}->${i.to_lat},${i.to_lng}:${i.mode_of_transport}`).join('|')
  useEffect(() => {
    let cancelled = false
    const legs = items.filter(i => i.type === 'transit' && i.from_lat != null && i.from_lng != null && i.to_lat != null && i.to_lng != null)
    legs.forEach(async leg => {
      const route = await getQuickestRoute({ lat: leg.from_lat!, lng: leg.from_lng! }, { lat: leg.to_lat!, lng: leg.to_lng! }, leg.mode_of_transport)
      if (!cancelled && route && route.path.length > 1) setRoutePaths(prev => ({ ...prev, [leg.id]: route.path }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitSignature])
  // Estimated travel (time + type) between neighbouring stops that have no transit item between them
  const [gapInfo, setGapInfo] = useState<Record<string, GapTravel>>({})
  const sortedForGaps = [...items].sort((a, b) => a.sort_order - b.sort_order)
  const gapPairs: [ItineraryItem, ItineraryItem][] = []
  for (let i = 0; i < sortedForGaps.length - 1; i++) { const a = sortedForGaps[i], b = sortedForGaps[i + 1]; if (a.type !== 'transit' && b.type !== 'transit' && a.lat != null && a.lng != null && b.lat != null && b.lng != null) gapPairs.push([a, b]) }
  const gapSignature = gapPairs.map(([a, b]) => `${a.id}:${a.lat},${a.lng}->${b.id}:${b.lat},${b.lng}`).join('|')
  useEffect(() => {
    let cancelled = false
    gapPairs.forEach(async ([a, b]) => {
      const key = `${a.id}->${b.id}`
      const est = await estimateGapTravel({ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! })
      if (!cancelled) setGapInfo(prev => ({ ...prev, [key]: est }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapSignature])
  if (!profile) return null; if (!trip) return <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}><TopBar /><p style={{ padding: 20 }}>Loading trip… <button className="btn-outline btn-small" onClick={() => nav('/')}>Back</button></p></div>
  const saveT = async (t: Trip) => { setTrip(t); await api.saveTrip(t) }
  const deleteThisTrip = async () => {
    if (!window.confirm(`Delete "${trip.name || 'Untitled Trip'}" and all of its itinerary items? This cannot be undone.`)) return
    try { await api.deleteTrip(trip.id); nav('/') } catch (x: any) { alert(`Could not delete the trip: ${x.message}`) }
  }
  const addItems = async (news: ItineraryItem[]) => { const all = [...items, ...news]; setItems(all); if (news[0]) setExpandedId(news[0].id); await api.saveItems(news) }
  const update = async (it: ItineraryItem) => {
    let all = items.map(x => x.id === it.id ? it : x)
    if (it.type === 'hotel' && it.group_id) all = all.map(x => x.group_id === it.group_id && x.id !== it.id ? { ...x, title: it.title, place_name: it.place_name, booking_status: it.booking_status } : x)
    setItems(all); await api.saveItems(all.filter(x => x.id === it.id || x.group_id === it.group_id))
  }
  const remove = async (it: ItineraryItem) => { setItems(items.filter(x => x.id !== it.id)); await api.deleteItem(it.id) }
  const addTransit = async () => {
    if (!from || !to) return alert('Pick both From and To places')
    const calc = await calculateTransitMinutes(from, to, mode, tStart, tEnd)
    const dur = calc?.minutes ?? null
    // For routed (non-flight) legs, set arrival from departure + calculated route time
    const end = dur != null && tStart && !isFlight(mode) ? addMinutes(tStart, dur) : tEnd
    addItems([{ ...baseItem(trip, profile.id, items.length), type: 'transit', title: `${from.name} → ${to.name}`, from_name: from.name, from_lat: from.lat, from_lng: from.lng, to_name: to.name, to_lat: to.lat, to_lng: to.lng, lat: to.lat, lng: to.lng, place_name: to.name, start_at: tStart, end_at: end, duration_minutes: dur, mode_of_transport: mode }])
  }
  const recalcTransit = async (it: ItineraryItem) => {
    const fromC = it.from_lat != null && it.from_lng != null ? { lat: it.from_lat, lng: it.from_lng } : null
    const toC = it.to_lat != null && it.to_lng != null ? { lat: it.to_lat, lng: it.to_lng } : null
    const calc = await calculateTransitMinutes(fromC, toC, it.mode_of_transport, it.start_at, it.end_at)
    if (!calc) { alert('Could not calculate a transit time — pick the From and To places using search so they have locations.'); return }
    const updated = { ...it, duration_minutes: calc.minutes, end_at: it.start_at && !isFlight(it.mode_of_transport) ? addMinutes(it.start_at, calc.minutes) : it.end_at }
    await update(updated)
    alert(`Transit time: ${formatTransitTime(calc.minutes, it.mode_of_transport)}${isFlight(it.mode_of_transport) ? ' (hour:minute)' : ' minutes'} — ${calc.source}`)
  }
  const addHotel = () => { if (!hotel) return alert('Pick a hotel / place'); const gid = newId(); const common = { ...baseItem(trip, profile.id, items.length), type: 'hotel' as const, group_id: gid, title: hotel.name, place_name: hotel.display, lat: hotel.lat, lng: hotel.lng }; addItems([{ ...common, id: newId(), subtype: 'checkin', title: `${hotel.name} (Check-in)`, start_at: hIn, end_at: hIn, sort_order: items.length }, { ...common, id: newId(), subtype: 'checkout', title: `${hotel.name} (Check-out)`, start_at: hOut, end_at: hOut, sort_order: items.length + 1 }]) }
  const addActivity = () => { if (!act) return alert('Pick a place to visit'); addItems([{ ...baseItem(trip, profile.id, items.length), type: 'activity', title: act.name, place_name: act.display, lat: act.lat, lng: act.lng, start_at: aTime, end_at: aTime, image_url: `https://picsum.photos/seed/${encodeURIComponent(act.name)}/400/220` }]) }
  const addRestaurant = () => { if (!rest) return alert('Pick a restaurant'); addItems([{ ...baseItem(trip, profile.id, items.length), type: 'restaurant', title: rest.name, place_name: rest.display, lat: rest.lat, lng: rest.lng, start_at: rTime, end_at: rTime, image_url: `https://picsum.photos/seed/${encodeURIComponent(rest.name + '-food')}/400/220` }]) }
  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order)
  const pins = ordered.filter(i => i.lat != null).map((i, ix) => ({ id: i.id, lat: i.lat!, lng: i.lng!, label: `<b>${i.title}</b><br/>${i.place_name}`, number: ix + 1 }))
  const segments = ordered.filter(i => i.type === 'transit' && i.from_lat != null && i.from_lng != null && i.to_lat != null && i.to_lng != null).map(i => ({ id: i.id, fromLat: i.from_lat!, fromLng: i.from_lng!, toLat: i.to_lat!, toLng: i.to_lng!, path: routePaths[i.id], label: `<b>${i.title}</b><br/>1 (Start): ${i.from_name}<br/>2 (Finish): ${i.to_name}${i.mode_of_transport ? `<br/>${i.mode_of_transport}` : ''}<br/>Quickest route` }))
  const dayLoad = (day: string) => { const di = ordered.filter(i => i.start_at.slice(0, 10) === day); return { count: di.length, mins: di.reduce((s, i) => s + (i.duration_minutes || 60), 0), items: di } }
  const leastFullDay = days.reduce((best, d) => dayLoad(d).count < dayLoad(best).count ? d : best, days[0])
  const moveItem = async (it: ItineraryItem, toDay: string) => { const moved = { ...it, start_at: toDay + it.start_at.slice(10), end_at: it.end_at ? toDay + it.end_at.slice(10) : it.end_at }; await update(moved) }
  const onDrop = async (targetId: string) => { if (!dragId || dragId === targetId) return; const arr = [...ordered]; const a = arr.findIndex(x => x.id === dragId), b = arr.findIndex(x => x.id === targetId); const [m] = arr.splice(a, 1); arr.splice(b, 0, m); arr.forEach((x, i) => x.sort_order = i); setItems(arr); await api.saveItems(arr) }
  const fmtWhen = (iso: string) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  const bookingBadge = (s: ItineraryItem['booking_status']) => s === 'booked'
    ? <span style={{ background: 'var(--black)', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, flex: 'none' }}>Booked</span>
    : s === 'partially_booked'
      ? <span style={{ background: '#fff', color: 'var(--orange)', border: '1px solid var(--orange)', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, flex: 'none' }}>Partially Booked</span>
      : <span style={{ background: 'var(--orange)', color: '#fff', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700, flex: 'none' }}>Not Booked</span>
  const summaryOf = (it: ItineraryItem) => {
    if (it.type === 'transit') return `${it.from_name || '?'} → ${it.to_name || '?'}${it.mode_of_transport ? ` · ${it.mode_of_transport}` : ''}${it.start_at ? ` · ${fmtWhen(it.start_at)}` : ''}${it.duration_minutes != null ? ` · ${formatTransitTime(it.duration_minutes, it.mode_of_transport)}${isFlight(it.mode_of_transport) ? '' : ' min'}` : ''}`
    if (it.type === 'hotel') return `${it.place_name || ''}${it.start_at ? ` · ${it.subtype === 'checkout' ? 'Check-out' : 'Check-in'} ${fmtWhen(it.start_at)}` : ''}`
    return `${it.place_name || ''}${it.start_at ? ` · ${fmtWhen(it.start_at)}` : ''}`
  }
  const card = (it: ItineraryItem) => {
    const link = bookingLink(it)
    const isOpen = expandedId === it.id
    const toggle = () => setExpandedId(isOpen ? null : it.id)
    return <div key={it.id} draggable onDragStart={() => setDragId(it.id)} onDragOver={e => e.preventDefault()} onDrop={() => onDrop(it.id)} style={{ border: '1px solid var(--black)', borderLeft: '6px solid var(--orange)', borderRadius: 8, padding: 10, marginBottom: 10, background: '#fff', cursor: 'grab' }}>
      <div onClick={toggle} title={isOpen ? 'Click to collapse' : 'Click to expand'} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, cursor: 'pointer' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>⠿ {it.type === 'transit' ? '✈ TRANSIT' : it.type === 'hotel' ? '🏨 HOTEL / STAY' : it.type === 'restaurant' ? '🍽️ RESTAURANT' : '📍 THINGS TO DO'}</div>
          <div style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title || 'Untitled'}</div>
          <div style={{ fontSize: 12, color: '#333', marginTop: 2 }}>{summaryOf(it)}</div>
          {(it.booking_open_date || it.book_by_date) && <div style={{ fontSize: 12, marginTop: 2, fontWeight: it.book_by_date && it.booking_status !== 'booked' && it.book_by_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) ? 800 : 400, color: it.book_by_date && it.booking_status !== 'booked' && it.book_by_date < new Date().toISOString().slice(0, 10) ? '#c00' : it.book_by_date && it.booking_status !== 'booked' && it.book_by_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) ? 'var(--orange)' : '#555' }}>📅 {it.booking_open_date ? `Booking opens ${fmtDate(it.booking_open_date)}` : ''}{it.booking_open_date && it.book_by_date ? ' · ' : ''}{it.book_by_date ? `Book by ${fmtDate(it.book_by_date)}` : ''}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          {bookingBadge(it.booking_status)}
          <button type="button" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={e => { e.stopPropagation(); toggle() }} style={{ border: '1px solid var(--black)', background: '#fff', borderRadius: 6, width: 26, height: 26, fontWeight: 800 }}>{isOpen ? '▾' : '▸'}</button>
          <button type="button" aria-label="Delete item" title="Delete item" onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${it.title || 'this item'}"?`)) remove(it) }} style={{ border: 'none', background: 'none', fontWeight: 800, color: '#c00' }}>✕</button>
        </div>
      </div>
      {!isOpen && (it.type === 'activity' || it.type === 'restaurant') && it.image_url && <img src={it.image_url} alt={it.title} style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 6, marginTop: 8 }} />}
      {isOpen && <>
      <label>Name / Title</label><input value={it.title} onChange={e => update({ ...it, title: e.target.value })} />
      {it.type === 'transit' && <><label>From</label><input value={it.from_name} onChange={e => update({ ...it, from_name: e.target.value })} /><label>To</label><input value={it.to_name} onChange={e => update({ ...it, to_name: e.target.value })} /><label>Mode of Transportation</label><input value={it.mode_of_transport} onChange={e => update({ ...it, mode_of_transport: e.target.value })} placeholder="Airplane, Train, Bus, Public Transit…" /><label>Departure</label><input type="datetime-local" value={it.start_at} onChange={e => update({ ...it, start_at: e.target.value })} /><label>Arrival</label><input type="datetime-local" value={it.end_at} onChange={e => { const end = e.target.value; update({ ...it, end_at: end, duration_minutes: it.start_at && end ? Math.max(0, Math.round((+new Date(end) - +new Date(it.start_at)) / 60000)) : it.duration_minutes }) }} /><TransitTimeInput minutes={it.duration_minutes} mode={it.mode_of_transport} onChange={mins => update({ ...it, duration_minutes: mins })} /><button type="button" className="btn-outline btn-small" style={{ marginTop: 8 }} onClick={() => recalcTransit(it)}>Calculate Transit Time</button></>}
      {it.type === 'hotel' && <><label>Hotel Name</label><input value={it.title.replace(/ \((Check-in|Check-out)\)$/, '')} onChange={e => update({ ...it, title: `${e.target.value} (${it.subtype === 'checkout' ? 'Check-out' : 'Check-in'})` })} /><label>Place</label><input value={it.place_name} onChange={e => update({ ...it, place_name: e.target.value })} /><p style={{ fontSize: 12, margin: '6px 0' }}>{it.subtype === 'checkout' ? 'End of stay (Check-out)' : 'Beginning of stay (Check-in)'}: <b>{fmtDate(it.start_at)}</b></p><label>{it.subtype === 'checkout' ? 'Check-out' : 'Check-in'} Date &amp; Time</label><input type="datetime-local" value={it.start_at} onChange={e => update({ ...it, start_at: e.target.value, end_at: e.target.value })} /></>}
      {(it.type === 'activity' || it.type === 'restaurant') && <>{it.image_url && <img src={it.image_url} alt={it.title} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6, marginTop: 8 }} />}<label>{it.type === 'restaurant' ? 'Restaurant / Place' : 'Place'}</label><input value={it.place_name} onChange={e => update({ ...it, place_name: e.target.value })} /><label>Picture URL</label><input value={it.image_url} onChange={e => update({ ...it, image_url: e.target.value })} /><label>Date &amp; Time</label><input type="datetime-local" value={it.start_at} onChange={e => update({ ...it, start_at: e.target.value })} /></>}
      {(it.type !== 'transit') && it.type !== 'hotel' ? null : null}
      <label>Booking Status</label><select value={it.booking_status} onChange={e => update({ ...it, booking_status: e.target.value as ItineraryItem['booking_status'] })}><option value="not_booked">Not Booked</option><option value="partially_booked">Partially Booked</option><option value="booked">Booked</option></select>
      <label>Booking Open Date</label><input type="date" value={it.booking_open_date ?? ''} onChange={e => update({ ...it, booking_open_date: e.target.value })} />
      <label>Book By Date</label><input type="date" value={it.book_by_date ?? ''} onChange={e => update({ ...it, book_by_date: e.target.value })} />
      {it.booking_open_date && it.book_by_date && it.book_by_date < it.booking_open_date && <p style={{ fontSize: 12, color: '#c00', margin: '6px 0 0' }}>Book by date is before the booking open date.</p>}
      {link && <a href={link.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, color: 'var(--orange)', fontWeight: 700, fontSize: 13 }}>{link.label} ↗</a>}
      <button type="button" className="btn-outline btn-small" onClick={() => { if (window.confirm(`Delete "${it.title || 'this item'}"?`)) remove(it) }} style={{ display: 'block', marginTop: 12, color: '#c00', borderColor: '#c00' }}>Delete Item</button>
      </>}
    </div>
  }
  // Gray travel indicator shown between two stops when no transit item connects them
  const gapAfter = (it: ItineraryItem) => {
    const ix = ordered.findIndex(x => x.id === it.id); const next = ix >= 0 ? ordered[ix + 1] : undefined
    if (!next || it.type === 'transit' || next.type === 'transit') return null
    const info = gapInfo[`${it.id}->${next.id}`]
    const hasCoords = it.lat != null && it.lng != null && next.lat != null && next.lng != null
    return (
      <div key={`gap-${it.id}-${next.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '-4px 0 6px', color: '#808080' }}>
        <div style={{ width: 2, height: 10, background: '#c9c9c9' }} />
        <div style={{ fontSize: 12, fontWeight: 700, background: '#f2f2f2', border: '1px solid #d9d9d9', borderRadius: 999, padding: '3px 10px' }}>
          {hasCoords ? (info ? `${info.icon} ${info.type} · ${formatCompactDuration(info.minutes)}` : 'Calculating travel…') : 'Travel time unknown'}
        </div>
        <div style={{ width: 2, height: 10, background: '#c9c9c9' }} />
      </div>
    )
  }
  const renderCards = (list: ItineraryItem[]) => list.flatMap(it => [card(it), gapAfter(it)])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}><TopBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside className="panel" style={{ flex: '0 0 250px', borderRadius: 0 }}>
          <button className="btn-outline btn-small" onClick={() => nav('/')}>← All Trips</button>
          <button className="btn-outline btn-small" onClick={deleteThisTrip} style={{ marginLeft: 8, color: '#c00', borderColor: '#c00' }}>Delete Trip</button>
          <h3 style={{ fontFamily: "'Courier New',monospace" }}>Create Items</h3>
          <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6 }}><h4>Transit</h4><PlaceSearch label="From" onPick={setFrom} /><PlaceSearch label="To" onPick={setTo} /><label>Mode</label><input value={mode} onChange={e => setMode(e.target.value)} /><label>Departure</label><input type="datetime-local" value={tStart} onChange={e => setTStart(e.target.value)} /><label>Arrival</label><input type="datetime-local" value={tEnd} onChange={e => setTEnd(e.target.value)} /><button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addTransit}>Add Transit</button></div>
          <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6, marginTop: 14 }}><h4>Hotel / Stay</h4><PlaceSearch label="Hotel / Place" onPick={setHotel} /><label>Beginning of Stay</label><input type="datetime-local" value={hIn} onChange={e => setHIn(e.target.value)} /><label>End of Stay</label><input type="datetime-local" value={hOut} onChange={e => setHOut(e.target.value)} /><button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addHotel}>Add Hotel / Stay</button><p style={{ fontSize: 11 }}>Adds a check-in and a check-out card.</p></div>
          <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6, marginTop: 14 }}><h4>Things to Do</h4><PlaceSearch label="Place" onPick={setAct} /><label>Date &amp; Time</label><input type="datetime-local" value={aTime} onChange={e => setATime(e.target.value)} /><button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addActivity}>Add Thing to Do</button></div>
          <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6, marginTop: 14 }}><h4>Restaurant</h4><PlaceSearch label="Restaurant / Place" onPick={setRest} /><label>Date &amp; Time</label><input type="datetime-local" value={rTime} onChange={e => setRTime(e.target.value)} /><button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addRestaurant}>Add Restaurant</button></div>
        </aside>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="panel" style={{ borderRadius: 0, flex: 'none', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'end' }}>
            <div><label style={{ marginTop: 0 }}>Trip Name</label><input style={{ fontSize: 18, fontWeight: 800 }} value={trip.name} onChange={e => saveT({ ...trip, name: e.target.value })} /></div>
            <div><label style={{ marginTop: 0 }}>Dates</label><div style={{ display: 'flex', gap: 6 }}><input type="date" value={trip.start_date} onChange={e => saveT({ ...trip, start_date: e.target.value })} /><input type="date" value={trip.end_date} onChange={e => saveT({ ...trip, end_date: e.target.value })} /></div></div>
            <div><label style={{ marginTop: 0 }}>Major Stops</label><MajorStopsInput value={trip.major_stops} onChange={stops => saveT({ ...trip, major_stops: stops })} /></div>
          </div>
          <MapView pins={pins} segments={segments} showRoute />
        </div>
        <aside className="panel" style={{ flex: '0 0 330px', borderRadius: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><h3 style={{ margin: 0, fontFamily: "'Courier New',monospace" }}>Your Places</h3><label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 12 }}>Divide into days <span className="toggle"><input type="checkbox" checked={divide} onChange={e => setDivide(e.target.checked)} /><span className="slider" /></span></label></div>
          <p style={{ fontSize: 12 }}>Drag cards to reorder. Click a search result on the left to add it here.</p>
          {!divide && renderCards(ordered)}
          {divide && days.map(day => { const load = dayLoad(day); const over = load.count > 5 || load.mins > 480; return <div key={day}>
            <div style={{ borderTop: '3px solid var(--black)', margin: '14px 0 8px', paddingTop: 6, fontWeight: 800 }}>{fmtDate(day)} <span style={{ fontWeight: 400, fontSize: 12 }}>({load.count} items)</span></div>
            {over && <div style={{ background: '#fff3e8', border: '1px solid var(--orange)', borderRadius: 6, padding: 8, fontSize: 12, marginBottom: 8 }}>This day looks full. Suggestion: move an item to <b>{fmtDate(leastFullDay)}</b>. {load.items.length > 0 && <button className="btn-orange btn-small" onClick={() => moveItem(load.items[load.items.length - 1], leastFullDay)}>Move last item there</button>}</div>}
            {renderCards(load.items)}{load.items.length === 0 && <p style={{ fontSize: 12, color: '#666' }}>No items this day.</p>}
          </div> })}
          {divide && ordered.filter(i => !days.includes(i.start_at.slice(0, 10))).length > 0 && <><div style={{ borderTop: '3px solid var(--black)', margin: '14px 0 8px', paddingTop: 6, fontWeight: 800 }}>Outside trip dates</div>{renderCards(ordered.filter(i => !days.includes(i.start_at.slice(0, 10))))}</>}
        </aside>
      </div>
    </div>
  )
}
