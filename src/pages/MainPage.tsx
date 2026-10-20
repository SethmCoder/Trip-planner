import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/TopBar'
import MapView from '../components/MapView'
import MajorStopsInput from '../components/MajorStopsInput'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/data'
import { searchPlaces } from '../lib/geocoding'
import { newId, type Trip } from '../lib/types'

function TripCard({ trip, onChange, onOpen, onDelete }: { trip: Trip; onChange: (t: Trip) => void; onOpen: () => void; onDelete: (t: Trip) => void }) {
  const [placeQ, setPlaceQ] = useState(trip.place); const [results, setResults] = useState<any[]>([])
  const upd = (p: Partial<Trip>) => onChange({ ...trip, ...p })
  return (
    <div style={{ border: '1px solid var(--black)', borderRadius: 10, padding: 12, marginBottom: 12, background: '#fff' }}>
      <div onClick={onOpen} style={{ cursor: 'pointer', color: 'var(--orange)', fontWeight: 800, fontSize: 16 }}>{trip.name || 'Untitled Trip'} →</div>
      <label>Trip Name</label><input value={trip.name} onChange={e => upd({ name: e.target.value })} placeholder="Trip name" />
      <label>Trip Place</label>
      <input value={placeQ} onChange={async e => { setPlaceQ(e.target.value); upd({ place: e.target.value }); if (e.target.value.length > 2) setResults(await searchPlaces(e.target.value)) }} placeholder="Search a place…" />
      {results.length > 0 && <div style={{ border: '1px solid #999', borderRadius: 6, maxHeight: 120, overflowY: 'auto' }}>{results.map((r, i) => <button key={i} style={{ display: 'block', width: '100%', textAlign: 'left', background: '#fff', border: 'none', padding: '7px 9px', fontSize: 12 }} onClick={() => { upd({ place: r.name, place_lat: r.lat, place_lng: r.lng }); setPlaceQ(r.name); setResults([]) }}>{r.display}</button>)}</div>}
      <label>Start Date</label><input type="date" value={trip.start_date} onChange={e => upd({ start_date: e.target.value })} />
      <label>End Date</label><input type="date" value={trip.end_date} onChange={e => upd({ end_date: e.target.value })} />
      <label>Major Stops (comma separated)</label><MajorStopsInput value={trip.major_stops} onChange={stops => upd({ major_stops: stops })} />
      <label>Booking Status</label>
      <select value={trip.booking_status} onChange={e => upd({ booking_status: e.target.value as Trip['booking_status'] })}><option value="not_booked">Not Booked</option><option value="partially_booked">Partially Booked</option><option value="booked">Booked</option></select>
      <button className="btn-orange" style={{ width: '100%', marginTop: 12 }} onClick={onOpen}>Open Trip</button>
      <button className="btn-outline" style={{ width: '100%', marginTop: 8, color: '#c00', borderColor: '#c00' }} onClick={() => onDelete(trip)}>Delete Trip</button>
    </div>
  )
}
export default function MainPage() {
  const { profile } = useAuth(); const nav = useNavigate(); const [trips, setTrips] = useState<Trip[]>([])
  useEffect(() => { if (profile) api.listTrips(profile.id).then(setTrips) }, [profile])
  if (!profile) return null
  const create = async () => {
    const t: Trip = { id: newId(), user_id: profile.id, name: 'New Trip', place: '', place_lat: null, place_lng: null, start_date: new Date().toISOString().slice(0, 10), end_date: new Date().toISOString().slice(0, 10), major_stops: [], booking_status: 'not_booked', created_at: new Date().toISOString() }
    try { await api.saveTrip(t); setTrips(p => [...p, t]) } catch (x: any) { alert(`Could not create the trip: ${x.message}`) }
  }
  const change = async (t: Trip) => { setTrips(p => p.map(x => x.id === t.id ? t : x)); await api.saveTrip(t) }
  const deleteTrip = async (t: Trip) => {
    if (!window.confirm(`Delete "${t.name || 'Untitled Trip'}" and all of its itinerary items? This cannot be undone.`)) return
    try { await api.deleteTrip(t.id); setTrips(p => p.filter(x => x.id !== t.id)) } catch (x: any) { alert(`Could not delete the trip: ${x.message}`) }
  }
  const pins = trips.filter(t => t.place_lat != null).map(t => ({ id: t.id, lat: t.place_lat!, lng: t.place_lng!, label: `<b>${t.name}</b><br/>${t.place}` }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside className="panel" style={{ flex: '0 0 16.6%', minWidth: 220, borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderBottom: 'none' }}>
          <h2 style={{ marginTop: 4, fontFamily: "'Courier New',monospace" }}>Your Trips</h2>
          {trips.length === 0 && <p style={{ fontSize: 13 }}>No trips yet. Create your first trip!</p>}
          {trips.map(t => <TripCard key={t.id} trip={t} onChange={change} onOpen={() => nav(`/trip/${t.id}`)} onDelete={deleteTrip} />)}
        </aside>
        <MapView pins={pins} onPinClick={id => nav(`/trip/${id}`)}>
          <button className="btn-orange" onClick={create} style={{ position: 'absolute', top: 12, left: 54, zIndex: 500, boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}>Create New Trip</button>
        </MapView>
      </div>
    </div>
  )
}
