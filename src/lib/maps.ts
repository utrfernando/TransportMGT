export interface LatLng { lat: number; lng: number }

export const COLOMBO: LatLng = { lat: 6.9271, lng: 79.8612 };
export const SRI_LANKA_CENTER: LatLng = { lat: 7.8731, lng: 80.7718 };

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const pair = (a: string, b: string): LatLng | null => {
  const lat = parseFloat(a), lng = parseFloat(b);
  return valid(lat, lng) ? { lat: round(lat), lng: round(lng) } : null;
};

/**
 * Understands what an admin is likely to paste for a place:
 *  - plain coordinates:        6.9271, 79.8612
 *  - a Google Maps address:    https://www.google.com/maps/place/.../@6.9271,79.8612,17z/...   (also !3d..!4d.. and ?q=lat,lng forms)
 * Short links (maps.app.goo.gl/...) cannot be read in the browser — returns null so the caller can ask for the full link.
 */
export function parseMapInput(text: string): LatLng | null {
  const t = text.trim();
  if (!t) return null;
  const plain = /^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
  if (plain) return pair(plain[1], plain[2]);
  let decoded = t;
  try { decoded = decodeURIComponent(t); } catch { /* keep raw */ }
  const patterns = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /[?&](?:q|ll|query|center|destination)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/];
  for (const re of patterns) { const m = re.exec(decoded); if (m) { const p = pair(m[1], m[2]); if (p) return p; } }
  return null;
}

/** Opens the place in Google Maps (works on phones: offers the Maps app). */
export const googleMapsLink = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
/** Turn-by-turn directions to the place. */
export const googleDirectionsLink = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
