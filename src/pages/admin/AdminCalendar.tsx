import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { unwrap } from '../../lib/db';
import { colomboDate, fmtTime } from '../../lib/time';
import { useQuery } from '../../lib/queries';
import { cn } from '../../lib/utils';
import { AdminHeader } from '../../components/admin/ui';
import { Tabs } from '../../components/admin/crud';
import { Button } from '../../components/ui/Button';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';

type Kind = 'hire' | 'school' | 'driver' | 'maintenance';
interface Ev { key: string; date: string; sort: string; kind: Kind; title: string; sub: string; time: string; bookingId?: string; vehicleId?: string; detail: [string, string][] }

const KIND: Record<Kind, { label: string; chip: string; dot: string }> = {
  hire: { label: 'Vehicle hire', chip: 'bg-mint-100 text-mint-800 border-mint-300', dot: 'bg-mint-500' },
  school: { label: 'School route', chip: 'bg-lavender-100 text-lavender-700 border-lavender-300', dot: 'bg-lavender-500' },
  driver: { label: 'Driver assignment', chip: 'bg-sunshine-100 text-sunshine-800 border-sunshine-300', dot: 'bg-sunshine-500' },
  maintenance: { label: 'Maintenance', chip: 'bg-peach-100 text-peach-600 border-peach-300', dot: 'bg-peach-500' },
};
const VIEWS = [{ key: 'month', label: 'Month' }, { key: 'week', label: 'Week' }, { key: 'day', label: 'Day' }, { key: 'list', label: 'List' }];
const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const parse = (s: string) => new Date(s + 'T12:00:00');

type BookingRow = { id: string; reference: string; start_at: string; end_at: string; status: string; destination: string | null; arrangement: string; vehicles: { name: string } | null; customers: { full_name: string } | null; drivers: { full_name: string } | null };

const AdminCalendar: React.FC = () => {
  const navigate = useNavigate();
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [show, setShow] = useState<Record<Kind, boolean>>({ hire: true, school: true, driver: true, maintenance: true });
  const [open, setOpen] = useState<Ev | null>(null);

  const range = useMemo(() => {
    if (view === 'month') return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) };
    if (view === 'week') return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) };
    if (view === 'day') return { from: cursor, to: cursor };
    return { from: cursor, to: addDays(cursor, 60) };
  }, [view, cursor]);
  const fromS = ymd(range.from), toS = ymd(range.to);

  const data = useQuery(async () => {
    const fromIso = new Date(`${fromS}T00:00:00+05:30`).toISOString();
    const toIso = new Date(`${toS}T23:59:59+05:30`).toISOString();
    const [b, r, mt] = await Promise.all([
      supabase.from('hire_bookings').select('id,reference,start_at,end_at,status,destination,arrangement, vehicles(name), customers(full_name), drivers:assigned_driver_id(full_name)').neq('status', 'cancelled').lte('start_at', toIso).gte('end_at', fromIso),
      supabase.from('transport_routes').select('id,name,operating_days,departure_time,return_time, vehicles(name), drivers(full_name), schools(name)').eq('status', 'active'),
      supabase.from('vehicle_maintenance').select('id,service_date,next_service_date,category,description, vehicles(name)').or(`and(service_date.gte.${fromS},service_date.lte.${toS}),and(next_service_date.gte.${fromS},next_service_date.lte.${toS})`),
    ]);
    return { bookings: unwrap(b) as unknown as BookingRow[], routes: unwrap(r) as unknown as { id: string; name: string; operating_days: number[]; departure_time: string; return_time: string; vehicles: { name: string } | null; drivers: { full_name: string } | null; schools: { name: string } | null }[], maint: unwrap(mt) as unknown as { id: string; service_date: string; next_service_date: string | null; category: string; description: string | null; vehicles: { name: string } | null }[] };
  }, null as { bookings: BookingRow[]; routes: { id: string; name: string; operating_days: number[]; departure_time: string; return_time: string; vehicles: { name: string } | null; drivers: { full_name: string } | null; schools: { name: string } | null }[]; maint: { id: string; service_date: string; next_service_date: string | null; category: string; description: string | null; vehicles: { name: string } | null }[] } | null, [fromS, toS]);

  const events = useMemo(() => {
    if (!data.data) return [] as Ev[];
    const out: Ev[] = [];
    const days = eachDayOfInterval({ start: range.from, end: range.to });
    for (const b of data.data.bookings) {
      const sd = colomboDate(b.start_at), ed = colomboDate(b.end_at);
      for (const d of days.map(ymd)) {
        if (d < sd || d > ed) continue;
        const time = d === sd && d === ed ? `${fmtTime(b.start_at)}–${fmtTime(b.end_at)}` : d === sd ? `from ${fmtTime(b.start_at)}` : d === ed ? `until ${fmtTime(b.end_at)}` : 'all day';
        const detail: [string, string][] = [['Reference', b.reference], ['Status', b.status.replace('_', ' ')], ['Customer', b.customers?.full_name ?? '—'], ['Vehicle', b.vehicles?.name ?? '—'], ['Destination', b.destination ?? '—'], ['Time', time]];
        out.push({ key: `h${b.id}${d}`, date: d, sort: `${d}${fmtTime(b.start_at)}`, kind: 'hire', title: `${b.vehicles?.name} · ${b.customers?.full_name}`, sub: b.status.replace('_', ' '), time, bookingId: b.id, detail });
        if (b.drivers?.full_name) out.push({ key: `d${b.id}${d}`, date: d, sort: `${d}${fmtTime(b.start_at)}d`, kind: 'driver', title: `${b.drivers.full_name} drives ${b.vehicles?.name}`, sub: b.reference, time, bookingId: b.id, detail: [['Driver', b.drivers.full_name], ...detail] });
      }
    }
    for (const r of data.data.routes) {
      for (const d of days) {
        if (!r.operating_days.includes(d.getDay())) continue;
        const time = `${r.departure_time.slice(0, 5)}–${r.return_time.slice(0, 5)}`;
        out.push({ key: `r${r.id}${ymd(d)}`, date: ymd(d), sort: `${ymd(d)}${r.departure_time.slice(0, 5)}`, kind: 'school', title: `${r.name}`, sub: `${r.vehicles?.name ?? ''}${r.schools ? ' · ' + r.schools.name : ''}`, time,
          detail: [['Route', r.name], ['School', r.schools?.name ?? '—'], ['Vehicle', r.vehicles?.name ?? '—'], ['Driver', r.drivers?.full_name ?? 'Unassigned'], ['Time', time]] });
      }
    }
    for (const mt of data.data.maint) {
      const add = (d: string, label: string) => { if (d >= fromS && d <= toS) out.push({ key: `m${mt.id}${d}${label}`, date: d, sort: `${d}00`, kind: 'maintenance', title: `${mt.vehicles?.name} · ${mt.category.replace(/_/g, ' ')}`, sub: label, time: 'all day', detail: [['Vehicle', mt.vehicles?.name ?? '—'], ['Type', mt.category.replace(/_/g, ' ')], ['When', label], ['Notes', mt.description ?? '—']] }); };
      add(mt.service_date, 'Service done');
      if (mt.next_service_date) add(mt.next_service_date, 'Service due');
    }
    return out.filter(e => show[e.kind]).sort((a, b) => a.sort.localeCompare(b.sort));
  }, [data.data, range, show, fromS, toS]);

  const byDay = useMemo(() => { const m: Record<string, Ev[]> = {}; events.forEach(e => { (m[e.date] ??= []).push(e); }); return m; }, [events]);

  const step = (dir: 1 | -1) => setCursor(c => view === 'month' ? addMonths(c, dir) : view === 'week' ? addWeeks(c, dir) : addDays(c, view === 'day' ? dir : dir * 30));
  const title = view === 'month' ? format(cursor, 'MMMM yyyy') : view === 'week' ? `${format(range.from, 'd MMM')} – ${format(range.to, 'd MMM yyyy')}` : view === 'day' ? format(cursor, 'EEEE, d MMMM yyyy') : `Next 60 days from ${format(cursor, 'd MMM yyyy')}`;
  const today = ymd(new Date());

  const Chip: React.FC<{ e: Ev; compact?: boolean }> = ({ e, compact }) => (
    <button onClick={() => setOpen(e)} className={cn('w-full text-left rounded-lg border px-1.5 py-0.5 text-[11px] leading-tight font-semibold truncate hover:brightness-95', KIND[e.kind].chip)} title={`${e.title} — ${e.time}`}>
      {!compact && <span className="opacity-70 mr-1">{e.time.startsWith('from') || e.time === 'all day' ? '' : e.time.slice(0, 5)}</span>}{e.title}
    </button>
  );

  const dayColumn = (d: Date, big = false) => {
    const list = byDay[ymd(d)] ?? [];
    return (
      <div key={ymd(d)} className={cn('min-h-[110px] border border-ink-100 p-1.5 space-y-1 bg-white', !big && view === 'month' && !isSameMonth(d, cursor) && 'bg-ink-50/70 opacity-70', ymd(d) === today && 'ring-2 ring-mint-400 ring-inset')}>
        <button onClick={() => { setCursor(d); setView('day'); }} className="text-xs font-extrabold text-ink-500 hover:text-mint-600">{format(d, view === 'month' ? 'd' : 'EEE d')}</button>
        {list.slice(0, big ? 50 : 3).map(e => <Chip key={e.key} e={e} />)}
        {!big && list.length > 3 && <button onClick={() => { setCursor(d); setView('day'); }} className="text-[11px] font-bold text-mint-700">+{list.length - 3} more</button>}
      </div>
    );
  };

  return (
    <div>
      <AdminHeader title="Booking Calendar" subtitle="Hires, school routes, driver assignments and maintenance (Sri Lanka time)" />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} aria-label="Previous" className="p-2 rounded-full hover:bg-ink-100"><ChevronLeft size={20} /></button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>Today</Button>
          <button onClick={() => step(1)} aria-label="Next" className="p-2 rounded-full hover:bg-ink-100"><ChevronRight size={20} /></button>
        </div>
        <h2 className="font-display text-xl font-bold text-ink-900">{title}</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          {(Object.keys(KIND) as Kind[]).map(k => (
            <label key={k} className={cn('flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border cursor-pointer', show[k] ? KIND[k].chip : 'bg-white border-ink-200 text-ink-400')}>
              <input type="checkbox" className="hidden" checked={show[k]} onChange={e => setShow(s => ({ ...s, [k]: e.target.checked }))} /><span className={cn('h-2 w-2 rounded-full', KIND[k].dot)} />{KIND[k].label}
            </label>))}
        </div>
      </div>
      <Tabs tabs={VIEWS} active={view} onChange={setView} />

      {data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : data.loading && !data.data ? <Skeleton className="h-96" /> : <>
        {view === 'month' && <div className="overflow-x-auto"><div className="min-w-[760px]">
          <div className="grid grid-cols-7 text-xs font-extrabold uppercase text-ink-400 mb-1">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="px-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">{eachDayOfInterval({ start: range.from, end: range.to }).map(d => dayColumn(d))}</div></div></div>}
        {view === 'week' && <div className="overflow-x-auto"><div className="grid grid-cols-7 min-w-[840px]">{eachDayOfInterval({ start: range.from, end: range.to }).map(d => dayColumn(d, true))}</div></div>}
        {view === 'day' && <div className="rounded-4xl bg-white border border-ink-100 p-4 space-y-2">{(byDay[ymd(cursor)] ?? []).length === 0 ? <p className="text-ink-500 py-6 text-center">Nothing scheduled.</p> : (byDay[ymd(cursor)] ?? []).map(e => (
          <button key={e.key} onClick={() => setOpen(e)} className={cn('w-full text-left rounded-2xl border px-4 py-3 flex items-center justify-between gap-3', KIND[e.kind].chip)}><span><b>{e.title}</b><br /><span className="text-xs opacity-80">{KIND[e.kind].label} · {e.sub}</span></span><span className="text-sm font-bold whitespace-nowrap">{e.time}</span></button>))}</div>}
        {view === 'list' && <div className="space-y-4">{Object.keys(byDay).length === 0 ? <div className="rounded-4xl bg-white border border-ink-100 p-8 text-center text-ink-500">Nothing scheduled in this period.</div> : Object.entries(byDay).map(([d, list]) => (
          <div key={d} className="rounded-4xl bg-white border border-ink-100 p-4"><p className="font-display font-bold mb-2">{format(parse(d), 'EEEE, d MMMM')}</p><div className="space-y-1.5">{list.map(e => (
            <button key={e.key} onClick={() => setOpen(e)} className={cn('w-full text-left rounded-xl border px-3 py-2 flex items-center justify-between gap-3 text-sm', KIND[e.kind].chip)}><span><b>{e.title}</b> <span className="opacity-70">· {KIND[e.kind].label}</span></span><span className="font-bold whitespace-nowrap">{e.time}</span></button>))}</div></div>))}</div>}
      </>}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title}>
        {open && <div className="space-y-4"><span className={cn('inline-block text-xs font-extrabold px-3 py-1 rounded-full border', KIND[open.kind].chip)}>{KIND[open.kind].label}</span>
          <dl className="grid grid-cols-2 gap-3 text-sm">{open.detail.map(([k, v]) => <div key={k}><dt className="text-xs font-extrabold uppercase text-ink-400">{k}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>
          {open.bookingId && <Button onClick={() => navigate(`/admin/bookings?open=${open.bookingId}`)}>Open booking</Button>}</div>}
      </Modal>
    </div>
  );
};

export default AdminCalendar;
