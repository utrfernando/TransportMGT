import React, { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, subDays } from 'date-fns';
import { Eye, MapPin, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { supabase, type RouteStop, type TransportRoute } from '../../lib/supabase';
import { check, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useToast } from '../../contexts/ToastContext';
import { AdminHeader, Pager, Table, Td } from '../../components/admin/ui';
import { FormActions, KV, StatusBadge } from '../../components/admin/crud';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

import MapPicker from '../../components/maps/MapPicker';
import RouteMap from '../../components/maps/RouteMap';
import { googleDirectionsLink } from '../../lib/maps';

const PAGE = 12;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type Opt = { id: string; name: string };
type Row = TransportRoute & { schools: { name: string } | null; vehicles: { name: string } | null; drivers: { full_name: string } | null };

const schema = z.object({
  name: z.string().trim().min(2, 'Required').max(100), school_id: z.string().min(1, 'Choose a school'), vehicle_id: z.string().min(1, 'Choose a vehicle'), driver_id: z.string(),
  operating_days: z.array(z.number()).min(1, 'Pick at least one day'),
  departure_time: z.string().min(1, 'Required'), return_time: z.string().min(1, 'Required'),
  status: z.enum(['active', 'inactive']), notes: z.string().max(1000),
  stops: z.array(z.object({ stop_type: z.enum(['pickup', 'dropoff']), name: z.string().trim().min(1, 'Name required').max(150), scheduled_time: z.string(), latitude: z.number().nullable(), longitude: z.number().nullable() })),
}).refine(v => v.return_time > v.departure_time, { path: ['return_time'], message: 'Return must be after departure' });
type V = z.infer<typeof schema>;
const hhmm = (t: string) => t.slice(0, 5);

/** Routes on the same vehicle/driver must not overlap in time on a shared operating day. */
async function findConflict(v: V, selfId?: string): Promise<string | null> {
  if (v.status !== 'active') return null;
  const { data, error } = await supabase.from('transport_routes').select('id,name,vehicle_id,driver_id,operating_days,departure_time,return_time').eq('status', 'active');
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as TransportRoute[]) {
    if (r.id === selfId) continue;
    const sameResource = r.vehicle_id === v.vehicle_id || (v.driver_id && r.driver_id === v.driver_id);
    if (!sameResource) continue;
    if (!r.operating_days.some(d => v.operating_days.includes(d))) continue;
    if (hhmm(r.departure_time) < v.return_time && v.departure_time < hhmm(r.return_time)) {
      return `Conflicts with route "${r.name}" (${hhmm(r.departure_time)}–${hhmm(r.return_time)}) — same ${r.vehicle_id === v.vehicle_id ? 'vehicle' : 'driver'} on an overlapping day and time.`;
    }
  }
  return null;
}

const RouteForm: React.FC<{ route: Row | null; schools: Opt[]; vehicles: Opt[]; drivers: Opt[]; onDone: () => void; onCancel: () => void }> = ({ route, schools, vehicles, drivers, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: route?.name ?? '', school_id: route?.school_id ?? '', vehicle_id: route?.vehicle_id ?? '', driver_id: route?.driver_id ?? '',
      operating_days: route?.operating_days ?? [1, 2, 3, 4, 5], departure_time: route ? hhmm(route.departure_time) : '06:30', return_time: route ? hhmm(route.return_time) : '14:30',
      status: route?.status ?? 'active', notes: route?.notes ?? '', stops: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'stops' });
  const [pinIndex, setPinIndex] = useState<number | null>(null);
  const days = watch('operating_days');

  useEffect(() => {
    if (!route) return;
    supabase.from('route_stops').select('*').eq('route_id', route.id).order('sequence').then(({ data }) => {
      reset(cur => ({ ...cur, stops: ((data ?? []) as RouteStop[]).map(x => ({ stop_type: x.stop_type, name: x.name, scheduled_time: x.scheduled_time ? hhmm(x.scheduled_time) : '', latitude: x.latitude === null || x.latitude === undefined ? null : Number(x.latitude), longitude: x.longitude === null || x.longitude === undefined ? null : Number(x.longitude) })) }));
    });
  }, [route, reset]);

  const onSubmit = async (v: V) => {
    setSaving(true); setConflict(null);
    try {
      const c = await findConflict(v, route?.id);
      if (c) { setConflict(c); return; }
      const row = { name: v.name, school_id: v.school_id, vehicle_id: v.vehicle_id, driver_id: v.driver_id || null, operating_days: v.operating_days,
        departure_time: v.departure_time, return_time: v.return_time, status: v.status, notes: v.notes.trim() || null };
      let rid = route?.id;
      if (route) check(await supabase.from('transport_routes').update(row).eq('id', route.id));
      else rid = (unwrap(await supabase.from("transport_routes").insert(row).select("id").single()) as { id: string }).id;
      check(await supabase.from('route_stops').delete().eq('route_id', rid!));
      const withGeo = v.stops.some(x => x.latitude !== null && x.longitude !== null);
      if (v.stops.length) check(await supabase.from('route_stops').insert(v.stops.map((x, i) => ({ route_id: rid, stop_type: x.stop_type, name: x.name, sequence: i, scheduled_time: x.scheduled_time || null, ...(withGeo ? { latitude: x.latitude, longitude: x.longitude } : {}) }))));
      toast.success(route ? 'Route updated' : 'Route created');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save route'); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Route name *" error={errors.name?.message}><Input {...register('name')} placeholder="e.g. Morning – Nugegoda" /></Field>
      <Field label="School *" error={errors.school_id?.message}><Select {...register('school_id')}><option value="">Select…</option>{schools.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Vehicle *" error={errors.vehicle_id?.message}><Select {...register('vehicle_id')}><option value="">Select…</option>{vehicles.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Driver"><Select {...register('driver_id')}><option value="">Unassigned</option>{drivers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Departure time *" error={errors.departure_time?.message}><Input type="time" {...register('departure_time')} /></Field>
      <Field label="Return time *" error={errors.return_time?.message}><Input type="time" {...register('return_time')} /></Field>
      <div className="sm:col-span-2">
        <p className="mb-1.5 text-sm font-bold text-ink-700">Operating days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((dn, i) => (
            <button type="button" key={dn} onClick={() => setValue('operating_days', days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort(), { shouldValidate: true })}
              className={`px-4 py-1.5 rounded-full text-sm font-bold border-2 ${days.includes(i) ? 'bg-mint-500 border-mint-500 text-white' : 'border-ink-200 text-ink-600'}`}>{dn}</button>
          ))}
        </div>
        {errors.operating_days && <p className="mt-1 text-xs font-semibold text-red-500">{errors.operating_days.message}</p>}
      </div>
      <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
      <div className="sm:col-span-2">
        <div className="flex items-center justify-between mb-2"><p className="text-sm font-bold text-ink-700">Pickup & drop-off points</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => append({ stop_type: 'pickup', name: '', scheduled_time: '', latitude: null, longitude: null })}>+ Pickup</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => append({ stop_type: 'dropoff', name: '', scheduled_time: '', latitude: null, longitude: null })}>+ Drop-off</Button>
          </div></div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[90px_1fr_110px_auto_auto] gap-2 items-start">
              <Select {...register(`stops.${i}.stop_type`)}><option value="pickup">Pickup</option><option value="dropoff">Drop-off</option></Select>
              <div><Input placeholder="Location" {...register(`stops.${i}.name`)} />{errors.stops?.[i]?.name && <p className="text-xs text-red-500 font-semibold mt-1">{errors.stops[i]!.name!.message}</p>}</div>
              <Input type="time" {...register(`stops.${i}.scheduled_time`)} />
              <button type="button" title={watch(`stops.${i}.latitude`) !== null ? 'Pinned on the map — click to change' : 'Set the map pin'} aria-label="Set map pin" onClick={() => setPinIndex(i)}
                className={`p-2.5 rounded-full hover:bg-ink-100 ${watch(`stops.${i}.latitude`) !== null ? 'text-mint-600 bg-mint-50' : 'text-ink-400'}`}><MapPin size={16} /></button>
              <button type="button" aria-label="Remove stop" onClick={() => remove(i)} className="p-2.5 rounded-full hover:bg-ink-100 text-ink-500"><Trash2 size={16} /></button>
            </div>
          ))}
          {fields.length === 0 && <p className="text-sm text-ink-400">No stops added.</p>}
        </div>
      </div>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      {conflict && <p className="sm:col-span-2 rounded-2xl bg-red-50 text-red-600 text-sm font-semibold p-3">{conflict}</p>}
      <MapPicker open={pinIndex !== null} title={pinIndex !== null ? watch(`stops.${pinIndex}.name`) : ''}
        initial={pinIndex !== null && watch(`stops.${pinIndex}.latitude`) !== null ? { lat: watch(`stops.${pinIndex}.latitude`) as number, lng: watch(`stops.${pinIndex}.longitude`) as number } : null}
        onClose={() => setPinIndex(null)}
        onSave={p => { if (pinIndex !== null) { setValue(`stops.${pinIndex}.latitude`, p?.lat ?? null, { shouldDirty: true }); setValue(`stops.${pinIndex}.longitude`, p?.lng ?? null, { shouldDirty: true }); } setPinIndex(null); }} />
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={route ? 'Save changes' : 'Create route'} /></div>
    </form>
  );
};

type Asg = { id: string; student_id: string; start_date: string; students: { full_name: string; student_code: string } | null };

const RouteDetail: React.FC<{ route: Row }> = ({ route }) => {
  const toast = useToast();
  const [pick, setPick] = useState('');
  const stops = useQuery(async () => unwrap(await supabase.from('route_stops').select('*').eq('route_id', route.id).order('sequence')) as RouteStop[], [] as RouteStop[], [route.id]);
  const pinned = stops.data.filter(s => s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined).map(s => ({ name: s.name, type: s.stop_type, lat: Number(s.latitude), lng: Number(s.longitude), time: s.scheduled_time }));
  const asg = useQuery(async () => unwrap(await supabase.from('student_route_assignments').select('id,student_id,start_date,students(full_name,student_code)').eq('route_id', route.id).is('end_date', null)) as unknown as Asg[], [] as Asg[], [route.id]);
  const avail = useQuery(async () => {
    const students = unwrap(await supabase.from('students').select('id,full_name,student_code').eq('school_id', route.school_id!).eq('status', 'active').order('full_name')) as { id: string; full_name: string; student_code: string }[];
    const used = unwrap(await supabase.from('student_route_assignments').select('student_id').is('end_date', null)) as { student_id: string }[];
    const set = new Set(used.map(u => u.student_id));
    return students.filter(s => !set.has(s.id));
  }, [] as { id: string; full_name: string; student_code: string }[], [route.id, asg.data.length]);

  const assign = async () => {
    if (!pick) return;
    try { check(await supabase.from('student_route_assignments').insert({ student_id: pick, route_id: route.id, start_date: format(new Date(), 'yyyy-MM-dd') })); setPick(''); toast.success('Student assigned'); asg.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };
  const unassign = async (a: Asg) => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      if (a.start_date >= today) check(await supabase.from('student_route_assignments').delete().eq('id', a.id));
      else check(await supabase.from('student_route_assignments').update({ end_date: format(subDays(new Date(), 1), 'yyyy-MM-dd') }).eq('id', a.id));
      toast.success('Student removed from route (history kept)'); asg.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div className="space-y-5">
      <KV items={[['School', route.schools?.name], ['Vehicle', route.vehicles?.name], ['Driver', route.drivers?.full_name ?? 'Unassigned'], ['Days', route.operating_days.map(d => DAYS[d]).join(', ')],
        ['Departure', hhmm(route.departure_time)], ['Return', hhmm(route.return_time)]]} />
      <div>
        <h4 className="font-display font-bold mb-2">Stops</h4>
        {stops.data.length === 0 ? <p className="text-sm text-ink-500">No stops added.</p> :
          <>
            {pinned.length > 0 && <div className="mb-3"><RouteMap stops={pinned} height={300} /></div>}
            <ol className="text-sm space-y-1">{stops.data.map(s => <li key={s.id} className="flex flex-wrap items-center gap-2"><span className={`text-xs font-extrabold uppercase px-2 py-0.5 rounded-full ${s.stop_type === 'pickup' ? 'bg-mint-100 text-mint-700' : 'bg-sunshine-100 text-sunshine-700'}`}>{s.stop_type}</span>{s.name}{s.scheduled_time && <span className="text-ink-400">· {hhmm(s.scheduled_time)}</span>}
              {s.latitude !== null && s.latitude !== undefined && s.longitude !== null && <a href={googleDirectionsLink({ lat: Number(s.latitude), lng: Number(s.longitude) })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-mint-700 hover:underline"><MapPin size={12} /> Directions</a>}</li>)}</ol>
            {stops.data.length > 0 && pinned.length === 0 && <p className="text-xs text-ink-400 mt-2">No map pins yet — edit the route and tap the pin icon beside a stop to place it on the map.</p>}
          </>}
      </div>
      <div>
        <h4 className="font-display font-bold mb-2">Students on this route ({asg.data.length})</h4>
        <div className="flex gap-2 mb-3">
          <Select value={pick} onChange={e => setPick(e.target.value)}><option value="">Add a student…</option>{avail.data.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.student_code})</option>)}</Select>
          <Button onClick={assign} disabled={!pick}>Assign</Button>
        </div>
        {asg.loading ? <Skeleton className="h-16" /> : asg.data.length === 0 ? <p className="text-sm text-ink-500">No students assigned.</p> :
          <ul className="divide-y divide-ink-100 text-sm">{asg.data.map(a => <li key={a.id} className="py-2 flex items-center justify-between"><span><b>{a.students?.full_name}</b> <span className="text-ink-400">{a.students?.student_code} · since {a.start_date}</span></span>
            <button title="Remove from route" onClick={() => unassign(a)} className="p-2 rounded-full hover:bg-ink-100 text-ink-500"><UserMinus size={16} /></button></li>)}</ul>}
      </div>
    </div>
  );
};

/** Deleting a route is only allowed when it has never carried a student; otherwise the history must be kept. */
const DeleteRouteDialog: React.FC<{ route: Row | null; onClose: () => void; onChanged: () => void }> = ({ route, onClose, onChanged }) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const info = useQuery(async () => {
    if (!route) return { current: 0, past: 0 };
    const [c, a] = await Promise.all([
      supabase.from('student_route_assignments').select('id', { count: 'exact', head: true }).eq('route_id', route.id).is('end_date', null),
      supabase.from('student_route_assignments').select('id', { count: 'exact', head: true }).eq('route_id', route.id),
    ]);
    if (c.error || a.error) throw new Error((c.error ?? a.error)!.message);
    return { current: c.count ?? 0, past: (a.count ?? 0) - (c.count ?? 0) };
  }, { current: 0, past: 0 }, [route?.id]);

  const used = info.data.current + info.data.past > 0;
  const remove = async () => {
    if (!route) return;
    setBusy(true);
    try { check(await supabase.from('transport_routes').delete().eq('id', route.id)); toast.success('Route deleted'); onChanged(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete the route'); } finally { setBusy(false); }
  };
  const deactivate = async () => {
    if (!route) return;
    setBusy(true);
    try { check(await supabase.from('transport_routes').update({ status: 'inactive' }).eq('id', route.id)); toast.success('Route set to inactive — history kept'); onChanged(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update the route'); } finally { setBusy(false); }
  };

  if (!route) return null;
  if (info.loading) return <Modal open onClose={onClose} title="Delete route"><p className="text-sm text-ink-500">Checking the route’s history…</p></Modal>;
  if (info.error) return <Modal open onClose={onClose} title="Delete route"><ErrorState message={info.error} onRetry={info.reload} /></Modal>;
  if (used) return (
    <Modal open onClose={onClose} title="This route can’t be deleted">
      <div className="space-y-4">
        <p className="text-sm text-ink-700"><b>{route.name}</b> {info.data.current > 0 ? <>currently has <b>{info.data.current}</b> student(s) assigned{info.data.past > 0 ? <> and <b>{info.data.past}</b> past assignment(s)</> : null}</> : <>has <b>{info.data.past}</b> past student assignment(s)</>}. Deleting it would erase that history.</p>
        <ul className="text-sm text-ink-600 list-disc pl-5 space-y-1">
          {info.data.current > 0 && <li>To retire it, first move its students to another route (edit each student, or open this route and remove them).</li>}
          <li>You can set the route to <b>inactive</b> instead: it stops being used for new bookings and availability checks, and every record is kept.</li>
        </ul>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button>{route.status === 'active' && <Button variant="outline" loading={busy} onClick={deactivate}>Set route to inactive</Button>}</div>
      </div>
    </Modal>
  );
  return <ConfirmDialog open danger loading={busy} title="Delete this route?" confirmLabel="Delete route" message={`“${route.name}” and its stops will be permanently deleted. No students have ever been assigned to it. The deletion is kept in the audit log.`} onClose={onClose} onConfirm={remove} />;
};

export const AdminRoutes: React.FC = () => {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const opts = useQuery(async () => {
    const [sc, ve, dr] = await Promise.all([
      supabase.from('schools').select('id,name').eq('is_archived', false).order('name'),
      supabase.from('vehicles').select('id,name').eq('is_archived', false).neq('status', 'inactive').order('name'),
      supabase.from('drivers').select('id,full_name').eq('is_archived', false).eq('status', 'active').order('full_name'),
    ]);
    return { schools: unwrap(sc) as Opt[], vehicles: unwrap(ve) as Opt[], drivers: (unwrap(dr) as { id: string; full_name: string }[]).map(d => ({ id: d.id, name: d.full_name })) };
  }, { schools: [] as Opt[], vehicles: [] as Opt[], drivers: [] as Opt[] });

  const list = useQuery(async () => {
    const { data, count, error } = await supabase.from('transport_routes').select('*, schools(name), vehicles(name), drivers(full_name)', { count: 'exact' }).order('name').range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [page]);

  const ready = opts.data.schools.length > 0 && opts.data.vehicles.length > 0;
  return (
    <div>
      <AdminHeader title="School Transport Routes" subtitle="Schedules, stops and the students on each route" actions={<Button disabled={!ready} onClick={() => setEditing('new')}><Plus size={18} /> New route</Button>} />
      {!opts.loading && !ready && <p className="mb-4 rounded-2xl bg-sunshine-50 text-sunshine-700 text-sm font-semibold p-3">Add at least one school and one vehicle before creating routes.</p>}
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No routes yet" message="Create a route to schedule a school run." /></div>
        : <>
          <Table head={['Route', 'School', 'Vehicle / Driver', 'Days', 'Time', 'Status', '']}>
            {list.data.rows.map(r => (
              <tr key={r.id} className="hover:bg-ink-50">
                <Td className="font-bold">{r.name}</Td><Td>{r.schools?.name ?? '—'}</Td>
                <Td>{r.vehicles?.name ?? '—'}<br /><span className="text-xs text-ink-400">{r.drivers?.full_name ?? 'No driver'}</span></Td>
                <Td>{r.operating_days.map(d => DAYS[d][0]).join(' ')}</Td><Td>{hhmm(r.departure_time)}–{hhmm(r.return_time)}</Td><Td><StatusBadge status={r.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  <button title="View" onClick={() => setViewing(r)} className="p-2 rounded-full hover:bg-ink-100"><Eye size={16} /></button>
                  <button title="Edit" onClick={() => setEditing(r)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  <button title="Delete" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><Trash2 size={16} /></button>
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'New route' : 'Edit route'}>
        {editing && <RouteForm route={editing === 'new' ? null : editing} schools={opts.data.schools} vehicles={opts.data.vehicles} drivers={opts.data.drivers} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <Modal open={!!viewing} onClose={() => setViewing(null)} wide title={viewing?.name}>{viewing && <RouteDetail route={viewing} />}</Modal>
      <DeleteRouteDialog route={deleting} onClose={() => setDeleting(null)} onChanged={list.reload} />
    </div>
  );
};
