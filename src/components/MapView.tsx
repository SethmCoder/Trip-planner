import { useEffect, useRef } from 'react'
import L from 'leaflet'
export interface MapPin { id: string; lat: number; lng: number; label: string; number?: number }
export interface MapSegment { id: string; fromLat: number; fromLng: number; toLat: number; toLng: number; label: string; path?: { lat: number; lng: number }[] }
const arrowAt = (a: L.LatLng, b: L.LatLng) => {
  const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)
  const angle = Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI // 0 = north; arrow glyph points east
  return L.marker(mid, { icon: L.divIcon({ className: 'arrow-icon', html: `<div style="transform:rotate(${angle - 90}deg)">➤</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false })
}
export default function MapView({ pins, segments = [], onPinClick, showRoute = false, children }: { pins: MapPin[]; segments?: MapSegment[]; onPinClick?: (id: string) => void; showRoute?: boolean; children?: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null); const mapRef = useRef<L.Map | null>(null); const layerRef = useRef<L.LayerGroup | null>(null)
  useEffect(() => {
    if (!el.current || mapRef.current) return
    const map = L.map(el.current).setView([30, 0], 2); mapRef.current = map
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics | © OpenStreetMap contributors', maxZoom: 19 }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
  }, [])
  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current; if (!map || !layer) return
    layer.clearLayers(); const pts: L.LatLngExpression[] = []
    // Transit legs: a direct line between the departure and arrival stops, with endpoint dots and a direction arrow
    segments.forEach(s => {
      const a = L.latLng(s.fromLat, s.fromLng), b = L.latLng(s.toLat, s.toLng)
      // Draw the quickest route's real path when we have it; otherwise a direct line
      const line: L.LatLng[] = s.path && s.path.length > 1 ? s.path.map(p => L.latLng(p.lat, p.lng)) : [a, b]
      line.forEach(p => pts.push(p))
      // Split the line where it crosses the antimeridian (+/-180 longitude, e.g. Pacific flights)
      // so it wraps around the map edge instead of streaking the long way across the world
      const groups: L.LatLng[][] = [[line[0]]]
      for (let i = 1; i < line.length; i++) {
        if (Math.abs(line[i].lng - line[i - 1].lng) > 180) groups.push([line[i]])
        else groups[groups.length - 1].push(line[i])
      }
      groups.forEach(g => { if (g.length > 1) L.polyline(g, { color: '#f76d11', weight: 5, opacity: 0.95 }).bindPopup(s.label).addTo(layer) })
      // Label the travel dots: 1 at the start of the leg, 2 at the finish
      const dot = (pos: L.LatLng, num: number, kind: 'start' | 'finish') => L.marker(pos, { icon: L.divIcon({ className: 'endpoint-icon', html: `<div class="endpoint-label ${kind}">${num}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 1000 }).bindPopup(s.label)
      dot(a, 1, 'start').addTo(layer)
      dot(b, 2, 'finish').addTo(layer)
      // Direction arrow at the route's midpoint (using a pair of points that don't straddle the map edge)
      let midIdx = Math.floor(line.length / 2)
      while (midIdx > 0 && Math.abs(line[midIdx].lng - line[midIdx - 1].lng) > 180) midIdx--
      arrowAt(line[Math.max(0, midIdx - 1)], line[midIdx]).addTo(layer)
    })
    pins.forEach(p => {
      pts.push([p.lat, p.lng])
      const icon = L.divIcon({ className: 'orange-pin', html: `<div class="pin-body"><span class="pin-num">${p.number ?? ''}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 24] })
      const m = L.marker([p.lat, p.lng], { icon }).bindPopup(p.label); if (onPinClick) m.on('click', () => onPinClick(p.id)); m.addTo(layer)
    })
    if (showRoute && pins.length > 1) {
      const routePts = pins.map(p => L.latLng(p.lat, p.lng))
      L.polyline(routePts, { color: '#000000', weight: 2, dashArray: '6 6', opacity: 0.8 }).addTo(layer)
      for (let i = 0; i < routePts.length - 1; i++) arrowAt(routePts[i], routePts[i + 1]).addTo(layer)
    }
    if (pts.length === 1) map.setView(pts[0], 10); else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts as L.LatLngExpression[]).pad(0.2))
  }, [pins, segments, showRoute])
  return <div style={{ position: 'relative', flex: 1, minHeight: 300 }}><div ref={el} style={{ position: 'absolute', inset: 0 }} />{children}</div>
}
