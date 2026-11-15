import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, Trash2 } from 'lucide-react';
import { COLOMBO, parseMapInput, type LatLng } from '../../lib/maps';
import { OSM_ATTRIBUTION, OSM_TILES, pinIcon } from './RouteMap';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

interface Hit { display_name: string; lat: string; lon: string }

/** Admin tool: set (or move, or remove) the map pin of one pickup / drop-off point. Free OpenStreetMap — no key, no billing. */
const MapPicker: React.FC<{ open: boolean; title: string; initial: LatLng | null; onClose: () => void; onSave: (p: LatLng | null) => void }> = ({ open, title, initial, onClose, onSave }) => {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const [point, setPoint] = useState<LatLng | null>(initial);
  const [paste, setPaste] = useState('');
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);

  const put = (p: LatLng, fly = false) => {
    const m = map.current; if (!m) return;
    const r = { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 };
    if (!marker.current) {
      marker.current = L.marker([r.lat, r.lng], { icon: pinIcon('•', 'edit'), draggable: true }).addTo(m);
      marker.current.on('dragend', () => { const ll = marker.current!.getLatLng(); setPoint({ lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 }); });
    } else marker.current.setLatLng([r.lat, r.lng]);
    setPoint(r);
    if (fly) m.setView([r.lat, r.lng], Math.max(m.getZoom(), 16));
  };

  useEffect(() => {
    if (!open || !host.current) return;
    setPoint(initial); setPaste(''); setPasteErr(null); setQ(''); setHits([]); setSearchMsg(null);
    const start = initial ?? COLOMBO;
    const m = L.map(host.current, { scrollWheelZoom: true }).setView([start.lat, start.lng], initial ? 16 : 12);
    L.tileLayer(OSM_TILES, { maxZoom: 19, attribution: OSM_ATTRIBUTION }).addTo(m);
    map.current = m; marker.current = null;
    if (initial) put(initial);
    m.on('click', e => put({ lat: e.latlng.lat, lng: e.latlng.lng }));
    const t = setTimeout(() => m.invalidateSize(), 250);
    return () => { clearTimeout(t); m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const search = async () => {
    const term = q.trim(); if (term.length < 3) return;
    setSearching(true); setSearchMsg(null); setHits([]);
    try {
      // OpenStreetMap's free place search. Only the typed place name is sent. Results are limited to Sri Lanka.
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=lk&q=${encodeURIComponent(term)}`, { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('search failed');
      const data = (await r.json()) as Hit[];
      setHits(data); if (data.length === 0) setSearchMsg('No match. Try a nearby landmark, or click the map.');
    } catch { setSearchMsg('Place search is unavailable right now. Click the map or paste a Google Maps link instead.'); }
    finally { setSearching(false); }
  };

  const applyPaste = (text: string) => {
    setPaste(text);
    if (!text.trim()) { setPasteErr(null); return; }
    const p = parseMapInput(text);
    if (p) { setPasteErr(null); put(p, true); }
    else setPasteErr(/goo\.gl|maps\.app/.test(text) ? 'Short links cannot be read. Open the link, then copy the long address from your browser’s address bar — or right-click the place in Google Maps and copy the numbers.' : 'Could not find coordinates in that. Paste a Google Maps address or numbers like 6.9271, 79.8612.');
  };

  return (
    <Modal open={open} onClose={onClose} wide title={`Map pin — ${title || 'stop'}`}>
      <div className="space-y-4">
        <p className="text-sm text-ink-600">Click the map to drop the pin (drag it to fine-tune), search for a place, or paste a Google Maps link. Parents will see this point on their child’s route map.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="flex gap-2"><Input placeholder="Search a place or landmark…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} aria-label="Search for a place" />
              <Button type="button" variant="outline" onClick={search} loading={searching} aria-label="Search"><Search size={16} /></Button></div>
            {searchMsg && <p className="text-xs text-ink-500 mt-1">{searchMsg}</p>}
            {hits.length > 0 && <ul className="mt-2 max-h-36 overflow-y-auto rounded-2xl border border-ink-100 divide-y divide-ink-100 text-sm">{hits.map((h, i) => (
              <li key={i}><button type="button" className="w-full text-left p-2.5 hover:bg-ink-50" onClick={() => { put({ lat: parseFloat(h.lat), lng: parseFloat(h.lon) }, true); setHits([]); }}>{h.display_name}</button></li>))}</ul>}
          </div>
          <div>
            <Input placeholder="…or paste a Google Maps link / 6.9271, 79.8612" value={paste} onChange={e => applyPaste(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} aria-label="Paste a Google Maps link or coordinates" />
            {pasteErr && <p className="text-xs text-red-600 mt-1">{pasteErr}</p>}
          </div>
        </div>
        <div ref={host} style={{ height: 340 }} className="w-full rounded-2xl overflow-hidden border border-ink-100 z-0" role="application" aria-label="Map: click to place the pin" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink-700 flex items-center gap-2"><MapPin size={16} className="text-mint-600" />{point ? `${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}` : 'No pin yet — click the map'}</p>
          <div className="flex gap-2">
            {initial && <Button type="button" variant="ghost" className="text-red-600" onClick={() => onSave(null)}><Trash2 size={15} /> Remove pin</Button>}
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="button" disabled={!point} onClick={() => point && onSave(point)}>Save pin</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default MapPicker;
