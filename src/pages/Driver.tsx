import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Bus, CalendarClock, LogOut, MapPin, Navigation, Phone, Route as RouteIcon, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { fmtDateTime } from '../lib/time';
import { useQuery } from '../lib/queries';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { googleDirectionsLink } from '../lib/maps';
import { Button } from '../components/ui/Button';
import { ErrorState, Skeleton } from '../components/ui/Feedback';
import RouteMap from '../components/maps/RouteMap';
import MustChangePassword from '../components/public/MustChangePassword';

// Shapes returned by driver_overview(): only what the admin has assigned to this driver. Never money, notes or other people's work.
interface Stop { type: 'pickup' | 'dropoff'; name: string; time: string | null; lat: number | null; lng: number | null }
interface Student { name: string; code: string; pickup: string | null; dropoff: string | null; guardian: string | null; guardian_phone: string | null }
interface RouteRow { id: string; name: string; school: string | null; days: number[]; departure_time: string; return_time: string; vehicle: string | null; registration_number: string | null; stops: Stop[]; students: Student[] }
interface VehicleRow { id: string; name: string; type: string; registration_number: string; brand: string | null; model: string | null; seats: number | null; fuel: string | null; status: string }
interface Trip { reference: string; status: string; hire_type: string; start_at: string; end_at: string; pickup: string | null; destination: string | null; return_to: string | null; passengers: number | null; vehicle: string; registration_number: string; customer: string; customer_phone: string | null; arrangement: string }
interface Overview { driver: { name: string; phone: string; licence_expiry: string | null; status: string }; vehicles: VehicleRow[]; routes: RouteRow[]; trips: Trip[] }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const Card: React.FC<{ title?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
  <section className={cn('rounded-2xl bg-white border border-navy-100 shadow-sm p-5 sm:p-6', className)}>{title && <h2 className="font-display text-lg font-bold text-navy-900 mb-4 flex items-center gap-2">{title}</h2>}{children}</section>
);
const tel = (n: string | null) => n ? <a href={`tel:${n.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-1 font-bold text-navy-700 underline"><Phone size={13} />{n}</a> : null;

const RouteCard: React.FC<{ r: RouteRow }> = ({ r }) => {
  const pins = r.stops.filter(s => s.lat != null && s.lng != null).map(s => ({ name: s.name, type: s.type, lat: s.lat!, lng: s.lng!, time: s.time }));
  return (
    <Card title={<><RouteIcon size={20} className="text-navy-600" />{r.name}</>}>
      <p className="text-sm text-slate-600 mb-4">{r.school ? <>{r.school} · </> : null}Leaves <b>{hhmm(r.departure_time)}</b>, returns <b>{hhmm(r.return_time)}</b> · {r.days.map(d => DAYS[d] ?? d).join(', ')}{r.vehicle ? <> · <b>{r.vehicle}</b> ({r.registration_number})</> : null}</p>
      {pins.length > 0 && <RouteMap stops={pins} height={300} className="mb-4" />}
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-400 mb-2">Stops in order</h3>
      {r.stops.length === 0 ? <p className="text-sm text-slate-500 mb-5">No stops added yet.</p> : (
        <ol className="space-y-2 mb-5">{r.stops.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-navy-50 px-3 py-2 text-sm">
            <span><b>{i + 1}.</b> {s.name} <span className="text-xs text-slate-500">({s.type === 'pickup' ? 'pick-up' : 'drop-off'}{s.time ? ` · ${hhmm(s.time)}` : ''})</span></span>
            {s.lat != null && s.lng != null && <a href={googleDirectionsLink({ lat: s.lat, lng: s.lng })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-navy-700 underline text-xs"><Navigation size={13} /> Directions</a>}
          </li>))}</ol>)}
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5"><Users size={14} /> Students on this route ({r.students.length})</h3>
      {r.students.length === 0 ? <p className="text-sm text-slate-500">No students assigned yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="py-1 pr-3">Student</th><th className="pr-3">Pick-up</th><th className="pr-3">Drop-off</th><th>Guardian</th></tr></thead>
          <tbody className="divide-y divide-navy-100">{r.students.map(s => (
            <tr key={s.code} className="align-top"><td className="py-2 pr-3 font-bold text-navy-900">{s.name}<br /><span className="text-xs font-normal text-slate-400">{s.code}</span></td><td className="pr-3">{s.pickup ?? '—'}</td><td className="pr-3">{s.dropoff ?? '—'}</td><td>{s.guardian ?? '—'}<br />{tel(s.guardian_phone)}</td></tr>))}</tbody>
        </table></div>)}
    </Card>
  );
};

const Driver: React.FC = () => {
  const { authUserId, loading, userName, signOut, mustChangePassword, isAdmin, kind } = useAuth();
  const navigate = useNavigate();
  const load = useQuery(async () => {
    const { data, error } = await supabase.rpc('driver_overview');
    if (error) throw new Error(friendlyError(error));
    return data as Overview;
  }, null as Overview | null, [authUserId, mustChangePassword]);

  if (loading || (authUserId && !isAdmin && !kind)) return <div className="py-32 text-center text-slate-400 font-bold" role="status">Loading…</div>;
  if (!authUserId) return <Navigate to="/account/login?next=/driver" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (!kind?.driver) return <Navigate to="/account" replace />;

  const d = load.data;
  const first = (userName ?? d?.driver.name ?? '').split(' ')[0];
  return (
    <div className="bg-navy-50/60 min-h-[70vh]">
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sunshine-300">Driver</p><h1 className="font-display text-3xl sm:text-4xl font-extrabold">{first ? `Hello, ${first}` : 'Welcome'}</h1></div>
          <Button variant="lightOutline" size="sm" onClick={async () => { await signOut(); navigate('/'); }}><LogOut size={16} /> Sign out</Button>
        </div>
      </section>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {mustChangePassword && <MustChangePassword />}
        {mustChangePassword ? null : load.loading ? <Skeleton className="h-64" /> : load.error ? <ErrorState message={load.error} onRetry={load.reload} /> : d && (<>
          <p className="flex gap-2 text-xs text-slate-500"><ShieldCheck size={16} className="text-navy-500 shrink-0" />You see only the routes, vehicles and trips your administrator has assigned to you. Anything missing or wrong? Please contact the office.</p>

          <Card title={<><Bus size={20} className="text-navy-600" /> My vehicles</>}>
            {d.vehicles.length === 0 ? <p className="text-sm text-slate-500">No vehicle has been assigned to you yet.</p> : (
              <div className="grid sm:grid-cols-2 gap-3">{d.vehicles.map(v => (
                <div key={v.id} className="rounded-xl bg-navy-50 p-4"><p className="font-display font-extrabold text-navy-900">{v.name}</p>
                  <p className="font-mono font-bold text-navy-700 tracking-wide">{v.registration_number}</p>
                  <p className="text-xs text-slate-500 mt-1">{[pretty(v.type), [v.brand, v.model].filter(Boolean).join(' '), v.seats ? `${v.seats} seats` : '', v.fuel ? pretty(v.fuel) : ''].filter(Boolean).join(' · ')}</p></div>))}</div>)}
          </Card>

          <h2 className="font-display text-xl font-extrabold text-navy-900 pt-2">My school routes</h2>
          {d.routes.length === 0 ? <Card><p className="text-sm text-slate-500">No route has been assigned to you yet.</p></Card> : d.routes.map(r => <RouteCard key={r.id} r={r} />)}

          <Card title={<><CalendarClock size={20} className="text-navy-600" /> My hire trips</>}>
            {d.trips.length === 0 ? <p className="text-sm text-slate-500">No hire trips assigned to you right now.</p> : (
              <ul className="space-y-3">{d.trips.map(t => (
                <li key={t.reference} className="rounded-xl border border-navy-100 p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><b className="text-navy-900">{fmtDateTime(t.start_at)} → {format(new Date(t.end_at), 'dd MMM, HH:mm')}</b><span className="rounded-full bg-navy-100 text-navy-800 text-xs font-bold px-2.5 py-0.5">{pretty(t.status)}</span></div>
                  <p className="mt-1 text-slate-700"><MapPin size={13} className="inline -mt-0.5" /> {t.pickup ?? '—'} → {t.destination ?? '—'}{t.return_to ? ` → ${t.return_to}` : ''}</p>
                  <p className="text-slate-600">{t.vehicle} ({t.registration_number}){t.passengers ? ` · ${t.passengers} passengers` : ''} · {pretty(t.hire_type)}</p>
                  <p className="text-slate-600">Customer: <b>{t.customer}</b> {tel(t.customer_phone)} <span className="text-xs text-slate-400">· {t.reference}</span></p>
                </li>))}</ul>)}
          </Card>
        </>)}
      </div>
    </div>
  );
};

export default Driver;
