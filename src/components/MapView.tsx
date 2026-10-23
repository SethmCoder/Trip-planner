import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { emojiForKind, fetchNearbyPois, type MapPoi } from '../lib/pois'

export interface SavePlacePayload {
  name: string
  place_name?: string
  lat: number
  lng: number
  category?: string
}

export interface MapPin {
  id: string
  lat: number
  lng: number
  label: string
  number?: number
  kind?: string
  name?: string
  savable?: boolean
}
export interface MapSegment { id: string; fromLat: number; fromLng: number; toLat: number; toLng: number; label: string; path?: { lat: number; lng: number }[] }

/** Keep consecutive longitudes continuous (e.g. Japan → Pacific → Seattle). */
function unwrapLng(lng: number, refLng: number) {
  let out = lng
  while (out - refLng > 180) out -= 360
  while (out - refLng < -180) out += 360
  return out
}

function unwrapPath(points: L.LatLng[]): L.LatLng[] {
  if (points.length === 0) return []
  const out: L.LatLng[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    out.push(L.latLng(points[i].lat, unwrapLng(points[i].lng, out[i - 1].lng)))
  }
  return out
}

const arrowAt = (a: L.LatLng, b: L.LatLng) => {
  const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)
  const angle = Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI
  return L.marker(mid, { icon: L.divIcon({ className: 'arrow-icon', html: `<div style="transform:rotate(${angle - 90}deg)">➤</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false })
}

function emojiPinIcon(kind: string | undefined, number: number | undefined, selected: boolean) {
  const emoji = emojiForKind(kind)
  const num = number != null ? `<span class="emoji-pin-num">${number}</span>` : ''
  return L.divIcon({
    className: 'emoji-pin',
    html: `<div class="emoji-pin-body${selected ? ' selected' : ''}"><span class="emoji-pin-glyph">${emoji}</span>${num}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
  })
}

function userLocationIcon() {
  return L.divIcon({
    className: 'user-loc-pin',
    html: `<div class="user-loc-pulse"></div><div class="user-loc-dot"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

export default function MapView({
  pins,
  segments = [],
  onPinClick,
  showRoute = false,
  selectedId,
  enableNearbyPois = false,
  showUserLocation = false,
  placeContext = '',
  onPoisLoaded,
  onSavePlace,
  children,
}: {
  pins: MapPin[]
  segments?: MapSegment[]
  onPinClick?: (id: string) => void
  showRoute?: boolean
  selectedId?: string | null
  enableNearbyPois?: boolean
  showUserLocation?: boolean
  placeContext?: string
  onPoisLoaded?: (pois: MapPoi[]) => void
  onSavePlace?: (place: SavePlacePayload) => void
  children?: React.ReactNode
}) {
  const el = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const poiLayerRef = useRef<L.LayerGroup | null>(null)
  const userLayerRef = useRef<L.LayerGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const accuracyRef = useRef<L.Circle | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const markersRef = useRef<Record<string, L.Marker>>({})
  const pinMetaRef = useRef<Record<string, { number?: number; kind?: string; name?: string; savable?: boolean; lat: number; lng: number }>>({})
  const poiCacheRef = useRef<Record<string, MapPoi>>({})
  const onPinClickRef = useRef(onPinClick)
  const onPoisLoadedRef = useRef(onPoisLoaded)
  const onSavePlaceRef = useRef(onSavePlace)
  const selectedIdRef = useRef(selectedId)
  const placeContextRef = useRef(placeContext)
  const fittedKeyRef = useRef('')
  const [poisOn, setPoisOn] = useState(true)
  const [poiStatus, setPoiStatus] = useState<'idle' | 'loading' | 'ready' | 'zoom' | 'empty' | 'error'>('idle')
  const [poiCount, setPoiCount] = useState(0)
  const [locStatus, setLocStatus] = useState<'off' | 'pending' | 'on' | 'denied'>('off')

  const pinsKey = pins.map(p => `${p.id}:${p.lat}:${p.lng}:${p.number ?? ''}:${p.kind ?? ''}:${p.savable ? 1 : 0}`).join('|')
  const segmentsKey = segments.map(s => `${s.id}:${s.fromLat},${s.fromLng}->${s.toLat},${s.toLng}:${s.path?.length ?? 0}`).join('|')

  useEffect(() => { onPinClickRef.current = onPinClick }, [onPinClick])
  useEffect(() => { onPoisLoadedRef.current = onPoisLoaded }, [onPoisLoaded])
  useEffect(() => { onSavePlaceRef.current = onSavePlace }, [onSavePlace])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { placeContextRef.current = placeContext }, [placeContext])

  useEffect(() => {
    if (!el.current || mapRef.current) return
    const map = L.map(el.current, {
      zoomControl: false,
      // Jump markers onto the visible world copy when panning across ±180°
      worldCopyJump: true,
      // No maxBounds — longitude wraps so Japan → Seattle can cross the Pacific
      minZoom: 2,
    }).setView([20, 0], 2)
    mapRef.current = map
    L.control.zoom({ position: 'topleft' }).addTo(map)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics | © OpenStreetMap contributors',
      maxZoom: 19,
      // Repeat tiles horizontally so Japan ↔ Seattle can cross the Pacific
      noWrap: false,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    poiLayerRef.current = L.layerGroup().addTo(map)
    userLayerRef.current = L.layerGroup().addTo(map)

    const onPopupClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      const btn = t?.closest?.('.map-save-btn, [data-save-pin]') as HTMLElement | null
      if (!btn) return
      e.preventDefault()
      e.stopPropagation()
      if (!onSavePlaceRef.current) return

      const id = btn.getAttribute('data-save-pin')
      if (id) {
        const pin = pinMetaRef.current[id]
        const poi = poiCacheRef.current[id]
        if (pin) {
          onSavePlaceRef.current({
            name: pin.name || 'Saved place',
            place_name: pin.name,
            lat: pin.lat,
            lng: pin.lng,
            category: pin.kind || 'other',
          })
          btn.textContent = 'Saved ✓'
          btn.setAttribute('disabled', 'true')
          return
        }
        if (poi) {
          onSavePlaceRef.current({
            name: poi.name,
            place_name: poi.name,
            lat: poi.lat,
            lng: poi.lng,
            category: poi.category,
          })
          btn.textContent = 'Saved ✓'
          btn.setAttribute('disabled', 'true')
          return
        }
      }

      const lat = parseFloat(btn.getAttribute('data-save-lat') || '')
      const lng = parseFloat(btn.getAttribute('data-save-lng') || '')
      const name = btn.getAttribute('data-save-name') || 'Place'
      const category = btn.getAttribute('data-save-category') || 'other'
      const place_name = btn.getAttribute('data-save-place') || name
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      onSavePlaceRef.current({ name, place_name, lat, lng, category })
      btn.textContent = 'Saved ✓'
      btn.setAttribute('disabled', 'true')
    }
    el.current.addEventListener('click', onPopupClick)

    const syncSize = () => { map.invalidateSize({ animate: false }) }
    requestAnimationFrame(syncSize)
    const t1 = window.setTimeout(syncSize, 50)
    const t2 = window.setTimeout(syncSize, 250)

    let ro: ResizeObserver | null = null
    if (wrapRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => syncSize())
      ro.observe(wrapRef.current)
    }
    window.addEventListener('resize', syncSize)

    return () => {
      el.current?.removeEventListener('click', onPopupClick)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', syncSize)
      ro?.disconnect()
      if (watchIdRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current)
      map.remove()
      mapRef.current = null
      layerRef.current = null
      poiLayerRef.current = null
      userLayerRef.current = null
      markersRef.current = {}
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current = {}
    pinMetaRef.current = {}
    const pts: L.LatLngExpression[] = []

    segments.forEach(s => {
      const a = L.latLng(s.fromLat, s.fromLng)
      const b = L.latLng(s.toLat, unwrapLng(s.toLng, s.fromLng))
      const raw: L.LatLng[] = s.path && s.path.length > 1
        ? s.path.map(p => L.latLng(p.lat, p.lng))
        : [a, L.latLng(s.toLat, s.toLng)]
      const line = unwrapPath(raw)
      line.forEach(p => pts.push(p))
      if (line.length > 1) {
        L.polyline(line, { color: '#F97316', weight: 5, opacity: 0.95 }).bindPopup(s.label).addTo(layer)
      }
      const dot = (pos: L.LatLng, num: number, kind: 'start' | 'finish') =>
        L.marker(pos, { icon: L.divIcon({ className: 'endpoint-icon', html: `<div class="endpoint-label ${kind}">${num}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 }).bindPopup(s.label)
      dot(line[0] || a, 1, 'start').addTo(layer)
      dot(line[line.length - 1] || b, 2, 'finish').addTo(layer)
      const midIdx = Math.floor(line.length / 2)
      if (line.length > 1) arrowAt(line[Math.max(0, midIdx - 1)], line[midIdx]).addTo(layer)
    })

    // Unwrap pins relative to the first pin so Pacific-spanning trips fit tightly
    const pinRefLng = pins[0]?.lng ?? 0
    pins.forEach(p => {
      const lng = unwrapLng(p.lng, pinRefLng)
      pts.push([p.lat, lng])
      const selected = selectedIdRef.current === p.id
      const m = L.marker([p.lat, lng], {
        icon: emojiPinIcon(p.kind, p.number, selected),
        zIndexOffset: selected ? 800 : 200,
      }).bindPopup(p.label, { maxWidth: 280, className: 'ttl-popup' })
      m.on('click', () => onPinClickRef.current?.(p.id))
      m.addTo(layer)
      markersRef.current[p.id] = m
      pinMetaRef.current[p.id] = { number: p.number, kind: p.kind, name: p.name, savable: p.savable, lat: p.lat, lng: p.lng }
    })

    if (showRoute && pins.length > 1) {
      const routePts = unwrapPath(pins.map(p => L.latLng(p.lat, p.lng)))
      L.polyline(routePts, { color: '#1F2937', weight: 2, dashArray: '6 6', opacity: 0.8 }).addTo(layer)
      for (let i = 0; i < routePts.length - 1; i++) arrowAt(routePts[i], routePts[i + 1]).addTo(layer)
    }

    const fitKey = `${pinsKey}|${segmentsKey}`
    if (pts.length > 0 && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey
      map.invalidateSize({ animate: false })
      if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 13))
      else map.fitBounds(L.latLngBounds(pts as L.LatLngExpression[]).pad(0.25), { maxZoom: 15 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey, segmentsKey, showRoute])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!selectedId) map.closePopup()
    Object.entries(markersRef.current).forEach(([id, m]) => {
      const selected = selectedId === id
      const meta = pinMetaRef.current[id]
      m.setIcon(emojiPinIcon(meta?.kind, meta?.number, selected))
      m.setZIndexOffset(selected ? 800 : 200)
      if (selected) {
        m.openPopup()
        map.panTo(m.getLatLng(), { animate: true })
      }
    })
  }, [selectedId, pinsKey])

  useEffect(() => {
    const map = mapRef.current
    const poiLayer = poiLayerRef.current
    if (!map || !poiLayer || !enableNearbyPois) return

    let aborted = false
    let timer: number | undefined
    let controller: AbortController | null = null

    const clearPois = () => { poiLayer.clearLayers() }

    const load = () => {
      if (!poisOn) {
        clearPois()
        setPoiStatus('idle')
        setPoiCount(0)
        onPoisLoadedRef.current?.([])
        return
      }
      const zoom = map.getZoom()
      if (zoom < 11) {
        clearPois()
        setPoiStatus('zoom')
        setPoiCount(0)
        return
      }
      const b = map.getBounds()
      // Keep requests small — wide views are slow and noisy
      if (Math.abs(b.getEast() - b.getWest()) > 2.5 || Math.abs(b.getNorth() - b.getSouth()) > 2.5) {
        clearPois()
        setPoiStatus('zoom')
        setPoiCount(0)
        return
      }
      controller?.abort()
      controller = new AbortController()
      setPoiStatus('loading')
      fetchNearbyPois({
        south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast(),
      }, {
        signal: controller.signal,
        placeContext: placeContextRef.current,
        zoom,
      }).then(pois => {
        if (aborted) return
        clearPois()
        poiCacheRef.current = {}
        // Already sorted by popularity; higher score → higher z-index
        pois.forEach((p, i) => {
          poiCacheRef.current[p.id] = p
          L.marker([p.lat, p.lng], {
            icon: emojiPinIcon(p.category, undefined, false),
            zIndexOffset: 50 + Math.max(0, 40 - i),
          }).bindPopup(p.label, { maxWidth: 280, className: 'ttl-popup' }).addTo(poiLayer)
        })
        setPoiCount(pois.length)
        setPoiStatus(pois.length ? 'ready' : 'empty')
        onPoisLoadedRef.current?.(pois)
      }).catch(err => {
        if (aborted || err?.name === 'AbortError') return
        setPoiStatus('error')
        setPoiCount(0)
      })
    }

    const schedule = () => {
      window.clearTimeout(timer)
      // Slightly longer debounce so pans don't spam Overpass
      timer = window.setTimeout(load, 480)
    }

    map.on('moveend', schedule)
    map.on('zoomend', schedule)
    schedule()

    return () => {
      aborted = true
      window.clearTimeout(timer)
      controller?.abort()
      map.off('moveend', schedule)
      map.off('zoomend', schedule)
      clearPois()
    }
  }, [enableNearbyPois, poisOn])

  const stopWatching = () => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    userMarkerRef.current = null
    accuracyRef.current = null
    userLayerRef.current?.clearLayers()
    setLocStatus('off')
  }

  const applyPosition = (pos: GeolocationPosition, fly: boolean) => {
    const map = mapRef.current
    const userLayer = userLayerRef.current
    if (!map || !userLayer) return
    const { latitude, longitude, accuracy } = pos.coords
    const latlng = L.latLng(latitude, longitude)
    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latlng, { icon: userLocationIcon(), zIndexOffset: 1200 })
        .bindPopup('<b>You are here</b>')
        .addTo(userLayer)
    } else userMarkerRef.current.setLatLng(latlng)
    if (!accuracyRef.current) {
      accuracyRef.current = L.circle(latlng, {
        radius: Math.min(accuracy || 40, 400), color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.15, weight: 1,
      }).addTo(userLayer)
    } else {
      accuracyRef.current.setLatLng(latlng)
      accuracyRef.current.setRadius(Math.min(accuracy || 40, 400))
    }
    setLocStatus('on')
    if (fly) map.flyTo(latlng, Math.max(map.getZoom(), 14), { duration: 0.8 })
  }

  const locateMe = () => {
    if (!navigator.geolocation) { alert('Geolocation is not supported in this browser.'); return }
    if (locStatus === 'on' || locStatus === 'pending') { stopWatching(); return }
    setLocStatus('pending')
    navigator.geolocation.getCurrentPosition(
      pos => {
        applyPosition(pos, true)
        watchIdRef.current = navigator.geolocation.watchPosition(p => applyPosition(p, false), () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })
      },
      err => {
        setLocStatus('denied')
        alert(err.code === 1
          ? 'Location permission was denied. Enable it in your browser settings to see yourself on the map.'
          : 'Could not get your location. Try again outdoors or check device settings.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    )
  }

  useEffect(() => {
    if (!showUserLocation) stopWatching()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUserLocation])

  return (
    <div className="map-stage" ref={wrapRef}>
      <div ref={el} className="map-leaflet-host" />
      <div className="map-toolbar">
        {showUserLocation && (
          <button type="button" className={`btn-secondary btn-small map-loc-btn${locStatus === 'on' ? ' active' : ''}`} onClick={locateMe} aria-pressed={locStatus === 'on'}>
            {locStatus === 'pending' ? 'Locating…' : locStatus === 'on' ? 'Hide my location' : 'My location'}
          </button>
        )}
        {enableNearbyPois && (
          <>
            <button type="button" className={`btn-secondary btn-small map-poi-toggle${poisOn ? ' active' : ''}`} onClick={() => setPoisOn(v => !v)} aria-pressed={poisOn}>
              {poisOn ? 'Nearby places on' : 'Nearby places off'}
            </button>
            {poisOn && poiStatus === 'zoom' && <span className="map-poi-hint">Zoom in closer to load map pins</span>}
            {poisOn && poiStatus === 'loading' && <span className="map-poi-hint">Loading places…</span>}
            {poisOn && poiStatus === 'ready' && <span className="map-poi-hint">{poiCount} popular places</span>}
            {poisOn && poiStatus === 'empty' && <span className="map-poi-hint">No places found here — try another area</span>}
            {poisOn && poiStatus === 'error' && <span className="map-poi-hint">Couldn’t load places — try again in a moment</span>}
          </>
        )}
      </div>
      {children}
    </div>
  )
}
