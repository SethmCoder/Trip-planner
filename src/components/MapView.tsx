import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { fetchNearbyPois, poiMeta, type MapPoi } from '../lib/pois'

export interface MapPin { id: string; lat: number; lng: number; label: string; number?: number; kind?: string }
export interface MapSegment { id: string; fromLat: number; fromLng: number; toLat: number; toLng: number; label: string; path?: { lat: number; lng: number }[] }

const WORLD_BOUNDS = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180))

const arrowAt = (a: L.LatLng, b: L.LatLng) => {
  const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)
  const angle = Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI
  return L.marker(mid, { icon: L.divIcon({ className: 'arrow-icon', html: `<div style="transform:rotate(${angle - 90}deg)">➤</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false })
}

function itineraryIcon(number: number | undefined, selected: boolean, kind?: string) {
  const size = selected ? 32 : 26
  const kindClass = kind ? ` pin-${kind}` : ''
  return L.divIcon({
    className: 'orange-pin',
    html: `<div class="pin-body${selected ? ' selected' : ''}${kindClass}"><span class="pin-num">${number ?? ''}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
  })
}

function poiIcon(poi: MapPoi) {
  const meta = poiMeta(poi.category)
  return L.divIcon({
    className: 'poi-pin',
    html: `<div class="poi-marker" style="background:${meta.color}" title="${meta.title}"><span>${meta.icon}</span></div>`,
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
  children,
}: {
  pins: MapPin[]
  segments?: MapSegment[]
  onPinClick?: (id: string) => void
  showRoute?: boolean
  selectedId?: string | null
  /** When true, load OSM Overpass POIs (hotels, restaurants, schools, …) at higher zoom. */
  enableNearbyPois?: boolean
  children?: React.ReactNode
}) {
  const el = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const poiLayerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Record<string, L.Marker>>({})
  const pinMetaRef = useRef<Record<string, { number?: number; kind?: string }>>({})
  const onPinClickRef = useRef(onPinClick)
  const selectedIdRef = useRef(selectedId)
  const fittedKeyRef = useRef('')
  const [poisOn, setPoisOn] = useState(true)
  const [poiStatus, setPoiStatus] = useState<'idle' | 'loading' | 'ready' | 'zoom'>('idle')

  const pinsKey = pins.map(p => `${p.id}:${p.lat}:${p.lng}:${p.number ?? ''}:${p.kind ?? ''}`).join('|')
  const segmentsKey = segments.map(s => `${s.id}:${s.fromLat},${s.fromLng}->${s.toLat},${s.toLng}:${s.path?.length ?? 0}`).join('|')

  useEffect(() => { onPinClickRef.current = onPinClick }, [onPinClick])
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  useEffect(() => {
    if (!el.current || mapRef.current) return
    const map = L.map(el.current, {
      zoomControl: false,
      worldCopyJump: false,
      maxBounds: WORLD_BOUNDS,
      maxBoundsViscosity: 1,
      minZoom: 2,
    }).setView([20, 0], 2)
    mapRef.current = map
    L.control.zoom({ position: 'topleft' }).addTo(map)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics | © OpenStreetMap contributors',
      maxZoom: 19,
      noWrap: true,
      bounds: WORLD_BOUNDS,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    poiLayerRef.current = L.layerGroup().addTo(map)

    const syncSize = () => { map.invalidateSize({ animate: false }) }
    // Leaflet needs a correct container size after flex layout settles
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
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('resize', syncSize)
      ro?.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
      poiLayerRef.current = null
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
      const a = L.latLng(s.fromLat, s.fromLng), b = L.latLng(s.toLat, s.toLng)
      const line: L.LatLng[] = s.path && s.path.length > 1 ? s.path.map(p => L.latLng(p.lat, p.lng)) : [a, b]
      line.forEach(p => pts.push(p))
      const groups: L.LatLng[][] = [[line[0]]]
      for (let i = 1; i < line.length; i++) {
        if (Math.abs(line[i].lng - line[i - 1].lng) > 180) groups.push([line[i]])
        else groups[groups.length - 1].push(line[i])
      }
      groups.forEach(g => { if (g.length > 1) L.polyline(g, { color: '#F97316', weight: 5, opacity: 0.95 }).bindPopup(s.label).addTo(layer) })
      const dot = (pos: L.LatLng, num: number, kind: 'start' | 'finish') =>
        L.marker(pos, { icon: L.divIcon({ className: 'endpoint-icon', html: `<div class="endpoint-label ${kind}">${num}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 }).bindPopup(s.label)
      dot(a, 1, 'start').addTo(layer)
      dot(b, 2, 'finish').addTo(layer)
      let midIdx = Math.floor(line.length / 2)
      while (midIdx > 0 && Math.abs(line[midIdx].lng - line[midIdx - 1].lng) > 180) midIdx--
      arrowAt(line[Math.max(0, midIdx - 1)], line[midIdx]).addTo(layer)
    })

    pins.forEach(p => {
      pts.push([p.lat, p.lng])
      const selected = selectedIdRef.current === p.id
      const m = L.marker([p.lat, p.lng], {
        icon: itineraryIcon(p.number, selected, p.kind),
        zIndexOffset: selected ? 800 : 200,
      }).bindPopup(p.label)
      m.on('click', () => onPinClickRef.current?.(p.id))
      m.addTo(layer)
      markersRef.current[p.id] = m
      pinMetaRef.current[p.id] = { number: p.number, kind: p.kind }
    })

    if (showRoute && pins.length > 1) {
      const routePts = pins.map(p => L.latLng(p.lat, p.lng))
      L.polyline(routePts, { color: '#1F2937', weight: 2, dashArray: '6 6', opacity: 0.8 }).addTo(layer)
      for (let i = 0; i < routePts.length - 1; i++) arrowAt(routePts[i], routePts[i + 1]).addTo(layer)
    }

    const fitKey = `${pinsKey}|${segmentsKey}`
    if (pts.length > 0 && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey
      map.invalidateSize({ animate: false })
      if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 12))
      else map.fitBounds(L.latLngBounds(pts as L.LatLngExpression[]).pad(0.25), { maxZoom: 14 })
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
      m.setIcon(itineraryIcon(meta?.number, selected, meta?.kind))
      m.setZIndexOffset(selected ? 800 : 200)
      if (selected) {
        m.openPopup()
        map.panTo(m.getLatLng(), { animate: true })
      }
    })
  }, [selectedId, pinsKey])

  // Nearby POIs (Overpass) — only when enabled, toggled on, and zoomed in enough
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
        return
      }
      const zoom = map.getZoom()
      if (zoom < 13) {
        clearPois()
        setPoiStatus('zoom')
        return
      }
      const b = map.getBounds()
      // Avoid huge areas near the zoom threshold
      if (Math.abs(b.getEast() - b.getWest()) > 1.2 || Math.abs(b.getNorth() - b.getSouth()) > 1.2) {
        clearPois()
        setPoiStatus('zoom')
        return
      }
      controller?.abort()
      controller = new AbortController()
      setPoiStatus('loading')
      fetchNearbyPois({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      }, controller.signal).then(pois => {
        if (aborted) return
        clearPois()
        pois.forEach(p => {
          L.marker([p.lat, p.lng], { icon: poiIcon(p), zIndexOffset: 50 })
            .bindPopup(p.label)
            .addTo(poiLayer)
        })
        setPoiStatus('ready')
      })
    }

    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(load, 450)
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

  return (
    <div className="map-stage" ref={wrapRef}>
      <div ref={el} className="map-leaflet-host" />
      {enableNearbyPois && (
        <div className="map-poi-controls">
          <button
            type="button"
            className={`btn-secondary btn-small map-poi-toggle${poisOn ? ' active' : ''}`}
            onClick={() => setPoisOn(v => !v)}
            aria-pressed={poisOn}
          >
            {poisOn ? 'Nearby places on' : 'Nearby places off'}
          </button>
          {poisOn && poiStatus === 'zoom' && (
            <span className="map-poi-hint">Zoom in to see hotels, restaurants, schools…</span>
          )}
          {poisOn && poiStatus === 'loading' && (
            <span className="map-poi-hint">Loading places…</span>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
