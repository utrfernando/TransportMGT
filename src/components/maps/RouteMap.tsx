import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { COLOMBO } from '../../lib/maps';

export interface MapStop { name: string; type: 'pickup' | 'dropoff'; lat: number; lng: number; time?: string | null }

export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** Numbered round pin. Only the number and the stop type go into the HTML — never text typed by a user. */
export const pinIcon = (n: number | string, type: 'pickup' | 'dropoff' | 'edit') =>
  L.divIcon({ className: 'map-pin-wrap', html: `<span class="map-pin map-pin-${type}">${n}</span>`, iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16] });

const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');

/**
 * Read-only OpenStreetMap showing a route's pickup / drop-off points in order, joined by a dashed line.
 * Free to use: no API key, no billing. Stop names go into popups as plain text (never as HTML).
 */
const RouteMap: React.FC<{ stops: MapStop[]; height?: number; className?: string }> = ({ stops, height = 320, className }) => {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { scrollWheelZoom: false, attributionControl: true }).setView([COLOMBO.lat, COLOMBO.lng], 12);
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const t = setTimeout(() => m.invalidateSize(), 250);   // correct sizing when shown inside a modal / tab
    return () => { clearTimeout(t); m.remove(); map.current = null; layer.current = null; };
  }, []);

  const key = JSON.stringify(stops);
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    stops.forEach((s, i) => {
      const ll: L.LatLngExpression = [s.lat, s.lng];
      pts.push(ll);
      const box = document.createElement('div');
      const b = document.createElement('b'); b.textContent = `${i + 1}. ${s.name}`; box.appendChild(b);
      const sub = document.createElement('div'); sub.textContent = `${s.type === 'pickup' ? 'Pickup' : 'Drop-off'}${s.time ? ` · ${hhmm(s.time)}` : ''}`; box.appendChild(sub);
      L.marker(ll, { icon: pinIcon(i + 1, s.type), title: s.name }).bindPopup(box).addTo(g);
    });
    if (pts.length > 1) L.polyline(pts, { color: '#243c78', weight: 3, opacity: 0.7, dashArray: '8 8' }).addTo(g);
    if (pts.length === 1) m.setView(pts[0], 15);
    else if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={host} style={{ height }} className={className ?? 'w-full rounded-2xl overflow-hidden border border-slate-200 z-0'} role="application" aria-label="Route map" />;
};

export default RouteMap;
