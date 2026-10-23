import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TopBar from '../components/TopBar'
import MapView from '../components/MapView'
import MajorStopsInput from '../components/MajorStopsInput'
import TransitTimeInput from '../components/TransitTimeInput'
import StatusBadge from '../components/StatusBadge'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/data'
import { searchPlaces, type GeoResult } from '../lib/geocoding'
import { bookingLink, discoveryLinks } from '../lib/bookingLinks'
import { newId, fmtDate, destinationThumbUrl, type Trip, type ItineraryItem } from '../lib/types'
import { calculateTransitMinutes, formatTransitTime, isFlight, addMinutes, getQuickestRoute, estimateGapTravel, formatCompactDuration, type LatLng, type GapTravel } from '../lib/routing'
import { fetchExperiences, poiMeta, type MapPoi } from '../lib/pois'
import { resolveTripImage } from '../lib/tripImages'
import { destinationTravelLinks, poiTravelLinks } from '../lib/travelApps'
import { shortAddress, hotelStayTitle, hotelPhase } from '../lib/formatPlace'
import DestinationThumb from '../components/DestinationThumb'

const STAY_COLORS = ['#2563EB', '#7C3AED', '#0891B2', '#DB2777', '#059669', '#D97706']

function compactGeo(r: GeoResult): GeoResult {
  return { ...r, name: shortAddress(r.name, 1) || r.name, display: shortAddress(r.display, 2) || r.display }
}

function categoryMeta(it: ItineraryItem) {
  if (it.type === 'transit') return { label: 'Transit', color: '#F97316', icon: '✈' }
  if (it.type === 'hotel') return { label: it.subtype === 'checkout' ? 'Hotel · Check-out' : it.subtype === 'checkin' ? 'Hotel · Check-in' : 'Hotel', color: '#2563EB', icon: '🏨' }
  if (it.type === 'restaurant') return { label: 'Restaurant', color: '#DC2626', icon: '🍽' }
  return { label: 'Experience', color: '#0D9488', icon: '★' }
}

function ItemThumb({ it }: { it: ItineraryItem }) {
  const meta = categoryMeta(it)
  const [failed, setFailed] = useState(false)
  const src = !failed
    ? (it.image_url || (it.lat != null && it.lng != null ? destinationThumbUrl(it.lat, it.lng, 14) : null))
    : null
  return (
    <div className="item-thumb" style={{ background: meta.color }} aria-hidden>
      {src
        ? <img src={src} alt="" onError={() => setFailed(true)} />
        : <span className="item-thumb-icon">{meta.icon}</span>}
    </div>
  )
}

const baseItem = (trip: Trip, userId: string, order: number): ItineraryItem => ({
  id: newId(), trip_id: trip.id, user_id: userId, type: 'activity', group_id: null, title: '', place_name: '',
  lat: trip.place_lat, lng: trip.place_lng, from_name: '', from_lat: null, from_lng: null, to_name: '', to_lat: null, to_lng: null,
  start_at: `${trip.start_date}T09:00`, end_at: `${trip.start_date}T10:00`, duration_minutes: 60, mode_of_transport: '',
  booking_status: 'not_booked', booking_open_date: '', book_by_date: '', image_url: '', sort_order: order, created_at: new Date().toISOString(),
})

function PlaceSearch({ label, onPick }: { label: string; onPick: (r: GeoResult) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<GeoResult[]>([])
  const [picked, setPicked] = useState('')
  return (
    <div>
      <label>{label}</label>
      <input
        value={picked || q}
        onChange={async e => {
          setPicked('')
          setQ(e.target.value)
          if (e.target.value.length > 2) setRes(await searchPlaces(e.target.value))
          else setRes([])
        }}
        placeholder="Search a place…"
        autoComplete="off"
      />
      {res.length > 0 && (
        <div className="autocomplete" role="listbox">
          {res.map((r, i) => (
            <button
              key={`${r.lat}-${r.lng}-${i}`}
              type="button"
              role="option"
              onClick={() => {
                const c = compactGeo(r)
                onPick(c)
                setPicked(c.name)
                setRes([])
              }}
            >
              <span className="ac-name">{shortAddress(r.name, 1) || r.name}</span>
              <span className="ac-detail">{shortAddress(r.display, 3)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TripPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const nav = useNavigate()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [items, setItems] = useState<ItineraryItem[]>([])
  const [divide, setDivide] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [dayRoutePaths, setDayRoutePaths] = useState<Record<string, LatLng[]>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [from, setFrom] = useState<GeoResult | null>(null)
  const [to, setTo] = useState<GeoResult | null>(null)
  const [mode, setMode] = useState('Airplane')
  const [tStart, setTStart] = useState('')
  const [tEnd, setTEnd] = useState('')
  const [hotel, setHotel] = useState<GeoResult | null>(null)
  const [hIn, setHIn] = useState('')
  const [hOut, setHOut] = useState('')
  const [act, setAct] = useState<GeoResult | null>(null)
  const [aTime, setATime] = useState('')
  const [rest, setRest] = useState<GeoResult | null>(null)
  const [rTime, setRTime] = useState('')
  const [mobilePanel, setMobilePanel] = useState<'create' | 'map' | 'places'>('map')
  const [rightTab, setRightTab] = useState<'places' | 'experiences'>('places')
  const [experiences, setExperiences] = useState<MapPoi[]>([])
  const [expStatus, setExpStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'need-place'>('idle')

  useEffect(() => {
    if (id) {
      api.getTrip(id).then(async t => {
        setTrip(t)
        if (t) {
          setTStart(`${t.start_date}T09:00`)
          setTEnd(`${t.start_date}T11:00`)
          setHIn(`${t.start_date}T15:00`)
          setHOut(`${t.end_date}T11:00`)
          setATime(`${t.start_date}T10:00`)
          setRTime(`${t.start_date}T19:00`)
          if (t.place && !t.image_url) {
            const img = await resolveTripImage(t.place, t.place_lat, t.place_lng)
            if (img) {
              const updated = { ...t, image_url: img }
              setTrip(updated)
              try { await api.saveTrip(updated) } catch { /* schema may lack image_url */ }
            }
          }
        }
      })
      api.listItems(id).then(setItems)
    }
  }, [id])

  const days = useMemo(() => {
    const out: string[] = []
    if (!trip) return out
    if (trip.start_date && trip.end_date) {
      const d = new Date(trip.start_date + 'T12:00:00')
      const end = new Date(trip.end_date + 'T12:00:00')
      while (d <= end && out.length < 60) {
        out.push(d.toISOString().slice(0, 10))
        d.setDate(d.getDate() + 1)
      }
    }
    return out.length ? out : [trip.start_date]
  }, [trip])

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

  const [gapInfo, setGapInfo] = useState<Record<string, GapTravel>>({})
  const sortedForGaps = [...items].sort((a, b) => a.sort_order - b.sort_order)
  const gapPairs: [ItineraryItem, ItineraryItem][] = []
  for (let i = 0; i < sortedForGaps.length - 1; i++) {
    const a = sortedForGaps[i], b = sortedForGaps[i + 1]
    if (a.type !== 'transit' && b.type !== 'transit' && a.lat != null && a.lng != null && b.lat != null && b.lng != null) gapPairs.push([a, b])
  }
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

  useEffect(() => {
    if (rightTab !== 'experiences' || !trip?.place_lat || !trip?.place_lng) {
      if (rightTab === 'experiences' && trip && (trip.place_lat == null || trip.place_lng == null)) setExpStatus('need-place')
      return
    }
    let cancelled = false
    setExpStatus('loading')
    const pad = 0.12
    fetchExperiences({
      south: trip.place_lat - pad,
      west: trip.place_lng - pad,
      north: trip.place_lat + pad,
      east: trip.place_lng + pad,
    }, trip.place).then(list => {
      if (cancelled) return
      setExperiences(list)
      setExpStatus(list.length ? 'ready' : 'empty')
    })
    return () => { cancelled = true }
  }, [rightTab, trip?.place_lat, trip?.place_lng, trip?.place])

  // Per-day route between that day's stops (e.g. Skytree → Tokyo Tower → Shibuya)
  const dayRouteSignature = useMemo(() => {
    if (!selectedDay) return ''
    return items
      .filter(i => i.start_at.slice(0, 10) === selectedDay && i.lat != null && i.lng != null)
      .sort((a, b) => a.sort_order - b.sort_order || a.start_at.localeCompare(b.start_at))
      .map(i => `${i.id}:${i.lat},${i.lng}`)
      .join('|')
  }, [selectedDay, items])

  useEffect(() => {
    if (!selectedDay || !dayRouteSignature) {
      setDayRoutePaths({})
      return
    }
    let cancelled = false
    const stops = items
      .filter(i => i.start_at.slice(0, 10) === selectedDay && i.lat != null && i.lng != null)
      .sort((a, b) => a.sort_order - b.sort_order || a.start_at.localeCompare(b.start_at))
    ;(async () => {
      const paths: Record<string, LatLng[]> = {}
      for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i], b = stops[i + 1]
        const key = `${a.id}->${b.id}`
        try {
          const route = await getQuickestRoute(
            { lat: a.lat!, lng: a.lng! },
            { lat: b.lat!, lng: b.lng! },
            a.type === 'transit' ? (a.mode_of_transport || 'car') : 'foot',
          )
          paths[key] = route?.path?.length ? route.path : [{ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! }]
        } catch {
          paths[key] = [{ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! }]
        }
      }
      if (!cancelled) setDayRoutePaths(paths)
    })()
    return () => { cancelled = true }
  }, [dayRouteSignature, selectedDay, items])

  if (!profile) return null
  if (!trip) {
    return (
      <div className="app-shell">
        <TopBar />
        <p style={{ padding: 24 }}>Loading trip… <button className="btn-secondary btn-small" onClick={() => nav('/')}>Back</button></p>
      </div>
    )
  }

  const saveT = async (t: Trip) => { setTrip(t); await api.saveTrip(t) }
  const deleteThisTrip = async () => {
    if (!window.confirm(`Delete "${trip.name || 'Untitled Trip'}" and all of its itinerary items? This cannot be undone.`)) return
    try { await api.deleteTrip(trip.id); nav('/') } catch (x: any) { alert(`Could not delete the trip: ${x.message}`) }
  }
  const addItems = async (news: ItineraryItem[]) => {
    const all = [...items, ...news]
    setItems(all)
    if (news[0]) setExpandedId(news[0].id)
    await api.saveItems(news)
  }
  const update = async (it: ItineraryItem) => {
    let all = items.map(x => x.id === it.id ? it : x)
    if (it.type === 'hotel' && it.group_id) {
      all = all.map(x => x.group_id === it.group_id && x.id !== it.id ? { ...x, title: it.title, place_name: it.place_name, booking_status: it.booking_status } : x)
    }
    setItems(all)
    await api.saveItems(all.filter(x => x.id === it.id || x.group_id === it.group_id))
  }
  const remove = async (it: ItineraryItem) => { setItems(items.filter(x => x.id !== it.id)); await api.deleteItem(it.id) }
  const addTransit = async () => {
    if (!from || !to) return alert('Pick both From and To places')
    const calc = await calculateTransitMinutes(from, to, mode, tStart, tEnd)
    const dur = calc?.minutes ?? null
    const end = dur != null && tStart && !isFlight(mode) ? addMinutes(tStart, dur) : tEnd
    addItems([{
      ...baseItem(trip, profile.id, items.length), type: 'transit', title: `${from.name} → ${to.name}`,
      from_name: from.name, from_lat: from.lat, from_lng: from.lng, to_name: to.name, to_lat: to.lat, to_lng: to.lng,
      lat: to.lat, lng: to.lng, place_name: shortAddress(to.display, 2) || to.name, start_at: tStart, end_at: end, duration_minutes: dur, mode_of_transport: mode,
    }])
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
  const addHotel = () => {
    if (!hotel) return alert('Pick a hotel / place')
    const gid = newId()
    const place = shortAddress(hotel.display, 2) || hotel.name
    const common = { ...baseItem(trip, profile.id, items.length), type: 'hotel' as const, group_id: gid, title: hotel.name, place_name: place, lat: hotel.lat, lng: hotel.lng }
    addItems([
      { ...common, id: newId(), subtype: 'checkin', title: `${hotel.name} (Check-in)`, start_at: hIn, end_at: hIn, sort_order: items.length },
      { ...common, id: newId(), subtype: 'checkout', title: `${hotel.name} (Check-out)`, start_at: hOut, end_at: hOut, sort_order: items.length + 1 },
    ])
  }
  const addActivity = () => {
    if (!act) return alert('Pick a place to visit')
    addItems([{
      ...baseItem(trip, profile.id, items.length), type: 'activity', title: act.name,
      place_name: shortAddress(act.display, 2) || act.name, lat: act.lat, lng: act.lng,
      start_at: aTime, end_at: aTime, image_url: `https://picsum.photos/seed/${encodeURIComponent(act.name)}/400/220`,
    }])
  }
  const addRestaurant = () => {
    if (!rest) return alert('Pick a restaurant')
    addItems([{
      ...baseItem(trip, profile.id, items.length), type: 'restaurant', title: rest.name,
      place_name: shortAddress(rest.display, 2) || rest.name, lat: rest.lat, lng: rest.lng,
      start_at: rTime, end_at: rTime, image_url: `https://picsum.photos/seed/${encodeURIComponent(rest.name + '-food')}/400/220`,
    }])
  }

  const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order || a.start_at.localeCompare(b.start_at))

  const hotelStayIndex = (() => {
    const map = new Map<string, number>()
    let n = 0
    for (const it of ordered) {
      if (it.type === 'hotel' && it.group_id && !map.has(it.group_id)) map.set(it.group_id, ++n)
    }
    return map
  })()

  const mapSourceItems = selectedDay
    ? ordered.filter(i => i.start_at.slice(0, 10) === selectedDay && i.lat != null && i.lng != null)
    : ordered.filter(i => i.lat != null && i.lng != null)

  const pins: { id: string; lat: number; lng: number; label: string; number?: number; kind?: string }[] =
    mapSourceItems.map((i, ix) => ({
      id: i.id,
      lat: i.lat!,
      lng: i.lng!,
      label: `<b>${shortAddress(i.title, 1) || i.title}</b><br/>${categoryMeta(i).label}<br/>${shortAddress(i.place_name)}`,
      number: ix + 1,
      kind: i.type,
    }))
  if (pins.length === 0 && !selectedDay && trip.place_lat != null && trip.place_lng != null) {
    pins.push({
      id: `trip-dest-${trip.id}`,
      lat: trip.place_lat,
      lng: trip.place_lng,
      label: `<b>${trip.name || 'Trip'}</b><br/>${shortAddress(trip.place)}`,
      kind: 'destination',
    })
  }

  const transitSegments = ordered
    .filter(i => i.type === 'transit' && i.from_lat != null && i.from_lng != null && i.to_lat != null && i.to_lng != null)
    .filter(i => !selectedDay || i.start_at.slice(0, 10) === selectedDay)
    .map(i => ({
      id: i.id,
      fromLat: i.from_lat!, fromLng: i.from_lng!, toLat: i.to_lat!, toLng: i.to_lng!,
      path: routePaths[i.id],
      label: `<b>${i.title}</b><br/>${shortAddress(i.from_name, 1)} → ${shortAddress(i.to_name, 1)}`,
    }))

  const dayPathSegments = selectedDay
    ? mapSourceItems.slice(0, -1).map((a, i) => {
      const b = mapSourceItems[i + 1]
      const key = `${a.id}->${b.id}`
      return {
        id: `day-${key}`,
        fromLat: a.lat!, fromLng: a.lng!, toLat: b.lat!, toLng: b.lng!,
        path: dayRoutePaths[key],
        label: `<b>Day route</b><br/>${shortAddress(a.title || a.place_name, 1)} → ${shortAddress(b.title || b.place_name, 1)}`,
      }
    })
    : []

  const segments = selectedDay ? [...dayPathSegments, ...transitSegments] : transitSegments
  const showDayRoute = Boolean(selectedDay && mapSourceItems.length > 1)
  const dayLoad = (day: string) => {
    const di = ordered.filter(i => i.start_at.slice(0, 10) === day)
    return { count: di.length, mins: di.reduce((s, i) => s + (i.duration_minutes || 60), 0), items: di }
  }
  const leastFullDay = days.reduce((best, d) => dayLoad(d).count < dayLoad(best).count ? d : best, days[0])
  const moveItem = async (it: ItineraryItem, toDay: string) => {
    const moved = { ...it, start_at: toDay + it.start_at.slice(10), end_at: it.end_at ? toDay + it.end_at.slice(10) : it.end_at }
    await update(moved)
  }
  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const arr = [...ordered]
    const a = arr.findIndex(x => x.id === dragId)
    const b = arr.findIndex(x => x.id === targetId)
    const [m] = arr.splice(a, 1)
    arr.splice(b, 0, m)
    arr.forEach((x, i) => { x.sort_order = i })
    setItems(arr)
    await api.saveItems(arr)
  }
  const fmtWhen = (iso: string) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

  const addExperienceToTrip = async (poi: MapPoi) => {
    if (!profile || !trip) return
    await addItems([{
      ...baseItem(trip, profile.id, items.length),
      type: 'activity',
      title: poi.name,
      place_name: shortAddress(trip.place, 2) || poi.name,
      lat: poi.lat,
      lng: poi.lng,
      start_at: aTime || `${trip.start_date}T10:00`,
      end_at: aTime || `${trip.start_date}T10:00`,
      image_url: '',
    }])
    setRightTab('places')
  }

  const selectDay = (day: string) => {
    setSelectedDay(prev => prev === day ? null : day)
    setDivide(true)
    setMobilePanel('map')
  }

  const card = (it: ItineraryItem) => {
    const link = bookingLink(it)
    const extra = discoveryLinks(it)
    const isOpen = expandedId === it.id
    const toggle = () => setExpandedId(isOpen ? null : it.id)
    const cat = categoryMeta(it)
    const stayNum = it.type === 'hotel' && it.group_id ? hotelStayIndex.get(it.group_id) : undefined
    const stayColor = stayNum ? STAY_COLORS[(stayNum - 1) % STAY_COLORS.length] : cat.color
    const displayTitle = it.type === 'hotel' ? hotelStayTitle(it.title) : (it.title || 'Untitled')
    const placeLine = it.type === 'transit'
      ? `${shortAddress(it.from_name, 1) || '?'} → ${shortAddress(it.to_name, 1) || '?'}`
      : shortAddress(it.place_name) || shortAddress(it.title, 1)
    const timeLine = it.type === 'hotel'
      ? `${hotelPhase(it.subtype)} · ${fmtWhen(it.start_at)}`
      : it.type === 'transit'
        ? `${fmtWhen(it.start_at)}${it.mode_of_transport ? ` · ${it.mode_of_transport}` : ''}${it.duration_minutes != null ? ` · ${formatTransitTime(it.duration_minutes, it.mode_of_transport)}${isFlight(it.mode_of_transport) ? '' : ' min'}` : ''}`
        : fmtWhen(it.start_at)

    return (
      <div
        key={it.id}
        className={`place-card place-card-${it.type}${isOpen ? ' open' : ''}${stayNum ? ` stay-${stayNum}` : ''}`}
        style={{ borderLeftColor: stayColor }}
        draggable
        onDragStart={() => setDragId(it.id)}
        onDragOver={e => e.preventDefault()}
        onDrop={() => onDrop(it.id)}
      >
        <div className="place-card-summary" onClick={toggle} title={isOpen ? 'Click to collapse' : 'Click to expand'}>
          <ItemThumb it={it} />
          <div className="place-card-main">
            <div className="place-card-badges">
              <span className="cat-badge" style={{ background: `${cat.color}18`, color: cat.color, borderColor: `${cat.color}55` }}>
                {cat.icon} {cat.label}
              </span>
              {stayNum != null && (
                <span className="stay-badge" style={{ background: stayColor }}>{`Stay ${stayNum}`}</span>
              )}
            </div>
            <div className="place-card-title">{displayTitle}</div>
            {placeLine && <div className="place-card-place">{placeLine}</div>}
            {timeLine && <div className="place-card-time">{timeLine}</div>}
            {(it.booking_open_date || it.book_by_date) && (
              <div className="place-card-booking-dates">
                {it.booking_open_date ? `Opens ${fmtDate(it.booking_open_date)}` : ''}
                {it.booking_open_date && it.book_by_date ? ' · ' : ''}
                {it.book_by_date ? `Book by ${fmtDate(it.book_by_date)}` : ''}
              </div>
            )}
          </div>
          <div className="place-card-actions">
            <StatusBadge status={it.booking_status} />
            <button type="button" className="place-icon-btn" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={e => { e.stopPropagation(); toggle() }}>
              {isOpen ? '▾' : '▸'}
            </button>
            <button
              type="button"
              className="place-icon-btn danger"
              aria-label="Delete item"
              title="Delete item"
              onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${it.title || 'this item'}"?`)) remove(it) }}
            >
              ✕
            </button>
          </div>
        </div>
        {isOpen && (
          <div className="place-card-body">
            <label>Name / Title</label>
            <input value={it.title} onChange={e => update({ ...it, title: e.target.value })} />
            {it.type === 'transit' && (
              <>
                <label>From</label><input value={it.from_name} onChange={e => update({ ...it, from_name: e.target.value })} />
                <label>To</label><input value={it.to_name} onChange={e => update({ ...it, to_name: e.target.value })} />
                <label>Mode of Transportation</label>
                <input value={it.mode_of_transport} onChange={e => update({ ...it, mode_of_transport: e.target.value })} placeholder="Airplane, Train, Bus, Public Transit…" />
                <label>Departure</label><input type="datetime-local" value={it.start_at} onChange={e => update({ ...it, start_at: e.target.value })} />
                <label>Arrival</label>
                <input
                  type="datetime-local"
                  value={it.end_at}
                  onChange={e => {
                    const end = e.target.value
                    update({ ...it, end_at: end, duration_minutes: it.start_at && end ? Math.max(0, Math.round((+new Date(end) - +new Date(it.start_at)) / 60000)) : it.duration_minutes })
                  }}
                />
                <TransitTimeInput minutes={it.duration_minutes} mode={it.mode_of_transport} onChange={mins => update({ ...it, duration_minutes: mins })} />
                <button type="button" className="btn-secondary btn-small" style={{ marginTop: 8 }} onClick={() => recalcTransit(it)}>Calculate Transit Time</button>
              </>
            )}
            {it.type === 'hotel' && (
              <>
                <label>Hotel Name</label>
                <input value={hotelStayTitle(it.title)} onChange={e => update({ ...it, title: `${e.target.value} (${it.subtype === 'checkout' ? 'Check-out' : 'Check-in'})` })} />
                <label>Place</label><input value={it.place_name} onChange={e => update({ ...it, place_name: shortAddress(e.target.value) || e.target.value })} />
                <p className="place-card-time" style={{ margin: '8px 0' }}>
                  {hotelPhase(it.subtype)}: <b>{fmtWhen(it.start_at)}</b>
                </p>
                <label>{hotelPhase(it.subtype)} Date &amp; Time</label>
                <input type="datetime-local" value={it.start_at} onChange={e => update({ ...it, start_at: e.target.value, end_at: e.target.value })} />
              </>
            )}
            {(it.type === 'activity' || it.type === 'restaurant') && (
              <>
                {it.image_url && <img src={it.image_url} alt="" className="place-card-thumb large" />}
                <label>{it.type === 'restaurant' ? 'Restaurant / Place' : 'Place'}</label>
                <input value={it.place_name} onChange={e => update({ ...it, place_name: e.target.value })} />
                <label>Picture URL</label><input value={it.image_url} onChange={e => update({ ...it, image_url: e.target.value })} />
                <label>Date &amp; Time</label><input type="datetime-local" value={it.start_at} onChange={e => update({ ...it, start_at: e.target.value })} />
              </>
            )}
            <label>Booking Status</label>
            <select value={it.booking_status} onChange={e => update({ ...it, booking_status: e.target.value as ItineraryItem['booking_status'] })}>
              <option value="not_booked">Not Booked</option>
              <option value="partially_booked">Partially Booked</option>
              <option value="booked">Booked</option>
            </select>
            <label>Booking Open Date</label>
            <input type="date" value={it.booking_open_date ?? ''} onChange={e => update({ ...it, booking_open_date: e.target.value })} />
            <label>Book By Date</label>
            <input type="date" value={it.book_by_date ?? ''} onChange={e => update({ ...it, book_by_date: e.target.value })} />
            {it.booking_open_date && it.book_by_date && it.book_by_date < it.booking_open_date && (
              <p className="field-error">Book by date is before the booking open date.</p>
            )}
            {link && (
              <a href={link.url} target="_blank" rel="noreferrer" className="place-booking-link">{link.label} ↗</a>
            )}
            {extra.length > 0 && (
              <div className="travel-link-row" style={{ marginTop: 8 }}>
                {extra.map(l => (
                  <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="travel-chip">{l.label}</a>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn-danger btn-small"
              style={{ display: 'block', marginTop: 12 }}
              onClick={() => { if (window.confirm(`Delete "${it.title || 'this item'}"?`)) remove(it) }}
            >
              Delete Item
            </button>
          </div>
        )}
      </div>
    )
  }

  const gapAfter = (it: ItineraryItem) => {
    const ix = ordered.findIndex(x => x.id === it.id)
    const next = ix >= 0 ? ordered[ix + 1] : undefined
    if (!next || it.type === 'transit' || next.type === 'transit') return null
    const info = gapInfo[`${it.id}->${next.id}`]
    const hasCoords = it.lat != null && it.lng != null && next.lat != null && next.lng != null
    return (
      <div key={`gap-${it.id}-${next.id}`} className="place-gap">
        <div className="place-gap-line" />
        <div className="place-gap-pill">
          {hasCoords ? (info ? `${info.icon} ${info.type} · ${formatCompactDuration(info.minutes)}` : 'Calculating travel…') : 'Travel time unknown'}
        </div>
        <div className="place-gap-line" />
      </div>
    )
  }

  const renderCards = (list: ItineraryItem[]) => list.flatMap(it => [card(it), gapAfter(it)])

  const dateError = trip.start_date && trip.end_date && trip.end_date < trip.start_date
    ? 'End date must be on or after the start date.'
    : null

  // Left sidebar kept as-is for consistency across pages (structure/labels/actions unchanged)
  const createSidebar = (
    <aside className="panel trip-create-sidebar">
      <button className="btn-outline btn-small" onClick={() => nav('/')}>← All Trips</button>
      <button className="btn-outline btn-small" onClick={deleteThisTrip} style={{ marginLeft: 8, color: '#c00', borderColor: '#c00' }}>Delete Trip</button>
      <h3 style={{ fontFamily: "'Courier New',monospace" }}>Create Items</h3>
      <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6 }}>
        <h4>Transit</h4>
        <PlaceSearch label="From" onPick={setFrom} />
        <PlaceSearch label="To" onPick={setTo} />
        <label>Mode</label><input value={mode} onChange={e => setMode(e.target.value)} />
        <label>Departure</label><input type="datetime-local" value={tStart} onChange={e => setTStart(e.target.value)} />
        <label>Arrival</label><input type="datetime-local" value={tEnd} onChange={e => setTEnd(e.target.value)} />
        <button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addTransit}>Add Transit</button>
      </div>
      <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6, marginTop: 14 }}>
        <h4>Hotel / Stay</h4>
        <PlaceSearch label="Hotel / Place" onPick={setHotel} />
        <label>Beginning of Stay</label><input type="datetime-local" value={hIn} onChange={e => setHIn(e.target.value)} />
        <label>End of Stay</label><input type="datetime-local" value={hOut} onChange={e => setHOut(e.target.value)} />
        <button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addHotel}>Add Hotel / Stay</button>
        <p style={{ fontSize: 11 }}>Adds a check-in and a check-out card.</p>
      </div>
      <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6, marginTop: 14 }}>
        <h4>Things to Do</h4>
        <PlaceSearch label="Place" onPick={setAct} />
        <label>Date &amp; Time</label><input type="datetime-local" value={aTime} onChange={e => setATime(e.target.value)} />
        <button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addActivity}>Add Thing to Do</button>
      </div>
      <div style={{ borderTop: '2px solid var(--orange)', paddingTop: 6, marginTop: 14 }}>
        <h4>Restaurant</h4>
        <PlaceSearch label="Restaurant / Place" onPick={setRest} />
        <label>Date &amp; Time</label><input type="datetime-local" value={rTime} onChange={e => setRTime(e.target.value)} />
        <button className="btn-orange" style={{ width: '100%', marginTop: 10 }} onClick={addRestaurant}>Add Restaurant</button>
      </div>
    </aside>
  )

  const destLinks = destinationTravelLinks(trip.place)

  const placesPanel = (
    <aside className="panel trip-places-sidebar">
      <div className="right-tabs" role="tablist" aria-label="Trip side panel">
        <button type="button" role="tab" aria-selected={rightTab === 'places'} className={rightTab === 'places' ? 'active' : ''} onClick={() => setRightTab('places')}>Your Places</button>
        <button type="button" role="tab" aria-selected={rightTab === 'experiences'} className={rightTab === 'experiences' ? 'active' : ''} onClick={() => setRightTab('experiences')}>Experiences</button>
      </div>

      {rightTab === 'places' && (
        <>
          <div className="places-header">
            <h3>Your Places</h3>
            <label className="places-toggle">
              <span>Divide into days</span>
              <span className="toggle">
                <input type="checkbox" checked={divide} onChange={e => {
                  setDivide(e.target.checked)
                  if (!e.target.checked) setSelectedDay(null)
                }} />
                <span className="slider" />
              </span>
            </label>
          </div>
          <p className="places-hint">
            Drag to reorder. Click a day to show that day’s route on the map
            {selectedDay ? <> · Viewing <b>{fmtDate(selectedDay)}</b></> : null}.
          </p>

          {days.length > 0 && (
            <div className="day-chip-row" role="tablist" aria-label="Trip days">
              <button
                type="button"
                className={`day-chip${!selectedDay ? ' active' : ''}`}
                onClick={() => setSelectedDay(null)}
              >
                All days
              </button>
              {days.map(day => {
                const load = dayLoad(day)
                return (
                  <button
                    key={day}
                    type="button"
                    className={`day-chip${selectedDay === day ? ' active' : ''}`}
                    onClick={() => selectDay(day)}
                    title={`Show route for ${fmtDate(day)}`}
                  >
                    {fmtDate(day)}
                    <span>{load.count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {ordered.length === 0 && !divide && (
            <div className="places-empty">
              <div className="places-empty-icon" aria-hidden>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
                  <path d="M20 10v12M14 18l6 8 6-8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h4>No places yet</h4>
              <p>Search for transit, hotels, activities, or restaurants on the left to pin them here and on the map.</p>
            </div>
          )}

          {!divide && renderCards(ordered)}
          {divide && days.map(day => {
            const load = dayLoad(day)
            const over = load.count > 5 || load.mins > 480
            const active = selectedDay === day
            return (
              <div key={day} className={`places-day${active ? ' active-day' : ''}`}>
                <button type="button" className="places-day-title" onClick={() => selectDay(day)}>
                  <span>
                    {fmtDate(day)} <span className="places-day-count">({load.count} items)</span>
                  </span>
                  <span className="places-day-route-hint">{active ? 'Route on map' : 'Show route'}</span>
                </button>
                {over && (
                  <div className="places-day-warning">
                    This day looks full. Suggestion: move an item to <b>{fmtDate(leastFullDay)}</b>.
                    {load.items.length > 0 && (
                      <button type="button" className="btn-orange btn-small" style={{ marginLeft: 8 }} onClick={() => moveItem(load.items[load.items.length - 1], leastFullDay)}>
                        Move last item there
                      </button>
                    )}
                  </div>
                )}
                {renderCards(load.items)}
                {load.items.length === 0 && <p className="places-day-empty">No items this day.</p>}
              </div>
            )
          })}
          {divide && ordered.filter(i => !days.includes(i.start_at.slice(0, 10))).length > 0 && (
            <>
              <div className="places-day-title static">Outside trip dates</div>
              {renderCards(ordered.filter(i => !days.includes(i.start_at.slice(0, 10))))}
            </>
          )}
        </>
      )}

      {rightTab === 'experiences' && (
        <div className="experiences-panel">
          <h3>Experiences</h3>
          <p className="places-hint">
            Attractions and points of interest near {trip.place || 'your destination'}. Open TripAdvisor or Lonely Planet for reviews and booking, or add one to your itinerary.
          </p>

          {destLinks.length > 0 && (
            <div className="travel-link-row" style={{ marginBottom: 14 }}>
              {destLinks.map(l => (
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="travel-chip" title={l.blurb}>{l.label}</a>
              ))}
            </div>
          )}

          {expStatus === 'need-place' && (
            <div className="places-empty">
              <h4>Set a destination</h4>
              <p>Choose a trip place with a map location so we can find nearby experiences.</p>
            </div>
          )}
          {expStatus === 'loading' && <p className="places-hint">Finding experiences…</p>}
          {expStatus === 'empty' && (
            <div className="places-empty">
              <h4>No experiences found</h4>
              <p>Try TripAdvisor or Lonely Planet above, or zoom the map and use Nearby places.</p>
            </div>
          )}
          {experiences.map(poi => {
            const meta = poiMeta(poi.category)
            const links = poiTravelLinks(poi.name, trip.place, poi.category)
            return (
              <div key={poi.id} className="experience-card">
                <div className="experience-card-top">
                  <span className="experience-badge" style={{ background: meta.color }}>{meta.icon}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="experience-title">{poi.name}</div>
                    <div className="experience-cat">{meta.title}</div>
                  </div>
                </div>
                <div className="travel-link-row">
                  {links.map(l => (
                    <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="travel-chip">{l.label}</a>
                  ))}
                </div>
                <button type="button" className="btn-orange btn-small" style={{ width: '100%', marginTop: 8 }} onClick={() => addExperienceToTrip(poi)}>
                  Add to itinerary
                </button>
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )

  return (
    <div className="app-shell trip-page">
      <TopBar />
      <div className="trip-mobile-tabs" role="tablist" aria-label="Trip panels">
        <button type="button" role="tab" aria-selected={mobilePanel === 'create'} className={mobilePanel === 'create' ? 'active' : ''} onClick={() => setMobilePanel('create')}>Create</button>
        <button type="button" role="tab" aria-selected={mobilePanel === 'map'} className={mobilePanel === 'map' ? 'active' : ''} onClick={() => setMobilePanel('map')}>Map</button>
        <button type="button" role="tab" aria-selected={mobilePanel === 'places'} className={mobilePanel === 'places' ? 'active' : ''} onClick={() => setMobilePanel('places')}>Places</button>
      </div>
      <div className="trip-body">
        <div className={`trip-col trip-col-create${mobilePanel === 'create' ? ' mobile-show' : ''}`}>
          {createSidebar}
        </div>

        <div className={`trip-col trip-col-center${mobilePanel === 'map' ? ' mobile-show' : ''}`}>
          {(trip.image_url || trip.place) && (
            <div className="trip-hero-strip">
              <DestinationThumb
                place={trip.place}
                name={trip.name}
                lat={trip.place_lat}
                lng={trip.place_lng}
                imageUrl={trip.image_url}
                size={56}
                className="trip-hero-thumb"
              />
              <div className="trip-hero-copy">
                <strong>{trip.name || 'Untitled Trip'}</strong>
                <span>{shortAddress(trip.place) || 'No destination yet'}</span>
              </div>
              {destLinks.slice(0, 3).map(l => (
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className="travel-chip">{l.label}</a>
              ))}
            </div>
          )}
          {selectedDay && (
            <div className="day-route-banner">
              <span>
                Day route: <strong>{fmtDate(selectedDay)}</strong>
                {mapSourceItems.length > 1
                  ? ` · ${mapSourceItems.map(i => shortAddress(i.title || i.place_name, 1) || 'Stop').join(' → ')}`
                  : ' · Add stops with locations to draw a path'}
              </span>
              <button type="button" className="btn-secondary btn-small" onClick={() => setSelectedDay(null)}>Clear</button>
            </div>
          )}
          <div className="trip-meta-bar">
            <div className="trip-meta-field trip-meta-name">
              <label htmlFor="trip-name-field">Trip Name</label>
              <input id="trip-name-field" value={trip.name} onChange={e => saveT({ ...trip, name: e.target.value })} />
            </div>
            <div className="trip-meta-field trip-meta-dates">
              <label>Dates</label>
              <div className="trip-meta-dates-row">
                <input type="date" aria-label="Start date" value={trip.start_date} onChange={e => saveT({ ...trip, start_date: e.target.value })} />
                <span className="trip-meta-sep">to</span>
                <input type="date" aria-label="End date" value={trip.end_date} onChange={e => saveT({ ...trip, end_date: e.target.value })} />
              </div>
              {dateError && <p className="field-error">{dateError}</p>}
            </div>
            <div className="trip-meta-field trip-meta-stops">
              <label>Major Stops</label>
              <MajorStopsInput value={trip.major_stops} onChange={stops => saveT({ ...trip, major_stops: stops })} />
            </div>
          </div>
          <MapView
            pins={pins}
            segments={segments}
            showRoute={showDayRoute || (!selectedDay && pins.length > 1)}
            enableNearbyPois
            showUserLocation
            placeContext={shortAddress(trip.place) || trip.place}
          />
        </div>

        <div className={`trip-col trip-col-places${mobilePanel === 'places' ? ' mobile-show' : ''}`}>
          {placesPanel}
        </div>
      </div>
    </div>
  )
}
