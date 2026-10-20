import { useEffect, useRef } from 'react'
import L from 'leaflet'
export interface MapPin { id: string; lat: number; lng: number; label: string; number?: number }
export default function MapView({ pins, onPinClick, showRoute = false, children }: { pins: MapPin[]; onPinClick?: (id: string) => void; showRoute?: boolean; children?: React.ReactNode }) {
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
    pins.forEach((p, i) => {
      pts.push([p.lat, p.lng])
      const icon = L.divIcon({ className: 'orange-pin', html: `<div class="pin-body"><span class="pin-num">${p.number ?? ''}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 24] })
      const m = L.marker([p.lat, p.lng], { icon }).bindPopup(p.label); if (onPinClick) m.on('click', () => onPinClick(p.id)); m.addTo(layer)
    })
    if (showRoute && pts.length > 1) {
      L.polyline(pts, { color: '#f76d11', weight: 3 }).addTo(layer)
      for (let i = 0; i < pts.length - 1; i++) {
        const a = L.latLng(pts[i]), b = L.latLng(pts[i + 1]); const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2)
        const angle = Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI // 0 = north
        const arrow = L.marker(mid, { icon: L.divIcon({ className: 'arrow-icon', html: `<div style="transform:rotate(${angle - 90}deg)">➤</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), interactive: false }); arrow.addTo(layer)
      }
    }
    if (pts.length === 1) map.setView(pts[0], 10); else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.2))
  }, [pins, showRoute])
  return <div style={{ position: 'relative', flex: 1, minHeight: 300 }}><div ref={el} style={{ position: 'absolute', inset: 0 }} />{children}</div>
}
