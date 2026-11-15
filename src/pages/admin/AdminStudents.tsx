import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, subDays } from 'date-fns';
import { ArrowLeft, Eye, KeyRound, Pencil, Plus } from 'lucide-react';
import { supabase, type Student } from '../../lib/supabase';
import { check, sanitizeSearch, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { FormActions, KV, SearchBox, StatusBadge } from '../../components/admin/crud';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 12;
type Row = Student & { schools: { name: string } | null; vehicles: { name: string } | null };
type Opt = { id: string; name: string };
type RouteOpt = { id: string; name: string; school_id: string | null };

const phone = z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid phone number');
const schema = z.object({
  full_name: z.string().trim().min(2, 'Required').max(120), school_id: z.string().min(1, 'Choose a school'),
  guardian_name: z.string().trim().min(2, 'Required').max(120), guardian_phone: phone,
  secondary_contact: z.string().trim().regex(/^([0-9+()\-\s]{7,20})?$/, 'Enter a valid phone number'),
  pickup_location: z.string().max(300), dropoff_location: z.string().max(300), route_id: z.string(), vehicle_id: z.string(),
  monthly_fee: z.string().refine(v => v !== '' && Number(v) >= 0 && !isNaN(Number(v)), 'Enter the monthly fee'),
  start_date: z.string().min(1, 'Required'), end_date: z.string(), status: z.enum(['active', 'paused', 'completed', 'withdrawn']), notes: z.string().max(1000),
}).refine(v => !v.end_date || v.end_date >= v.start_date, { path: ['end_date'], message: 'End date is before start date' });
type V = z.infer<typeof schema>;
const s = (v: string) => (v.trim() === '' ? null : v.trim());

const StudentForm: React.FC<{ student: Student | null; schools: Opt[]; vehicles: Opt[]; routes: RouteOpt[]; onDone: () => void; onCancel: () => void }> = ({ student, schools, vehicles, routes, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<{ id: string; route_id: string; start_date: string } | null>(null);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: student?.full_name ?? '', school_id: student?.school_id ?? '', guardian_name: student?.guardian_name ?? '', guardian_phone: student?.guardian_phone ?? '',
      secondary_contact: student?.secondary_contact ?? '', pickup_location: student?.pickup_location ?? '', dropoff_location: student?.dropoff_location ?? '',
      route_id: '', vehicle_id: student?.vehicle_id ?? '', monthly_fee: student?.monthly_fee?.toString() ?? '', start_date: student?.start_date ?? format(new Date(), 'yyyy-MM-dd'),
      end_date: student?.end_date ?? '', status: student?.status ?? 'active', notes: student?.notes ?? '',
    },
  });
  const schoolId = watch('school_id');

  useEffect(() => {
    if (!student) return;
    supabase.from('student_route_assignments').select('id,route_id,start_date').eq('student_id', student.id).is('end_date', null).maybeSingle().then(({ data }) => {
      const a = data as { id: string; route_id: string; start_date: string } | null;
      setCurrentRoute(a);
      if (a) reset(cur => ({ ...cur, route_id: a.route_id }));
    });
  }, [student, reset]);

  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      const row = { full_name: v.full_name, school_id: v.school_id, guardian_name: v.guardian_name, guardian_phone: v.guardian_phone, secondary_contact: s(v.secondary_contact),
        pickup_location: s(v.pickup_location), dropoff_location: s(v.dropoff_location), vehicle_id: s(v.vehicle_id), monthly_fee: Number(v.monthly_fee),
        start_date: v.start_date, end_date: s(v.end_date), status: v.status, notes: s(v.notes) };
      let sid = student?.id;
      if (student) check(await supabase.from('students').update(row).eq('id', student.id));
      else sid = (unwrap(await supabase.from("students").insert(row).select("id").single()) as { id: string }).id;

      // Route change: keep history. Close the old assignment (never delete) and open a new one.
      const newRoute = v.route_id || null;
      if (sid && (currentRoute?.route_id ?? null) !== newRoute) {
        const today = format(new Date(), 'yyyy-MM-dd');
        if (currentRoute) {
          if (currentRoute.start_date >= today) {
            if (newRoute) check(await supabase.from('student_route_assignments').update({ route_id: newRoute }).eq('id', currentRoute.id));
            else check(await supabase.from('student_route_assignments').delete().eq('id', currentRoute.id));
          } else {
            check(await supabase.from('student_route_assignments').update({ end_date: format(subDays(new Date(), 1), 'yyyy-MM-dd') }).eq('id', currentRoute.id));
            if (newRoute) check(await supabase.from('student_route_assignments').insert({ student_id: sid, route_id: newRoute, start_date: today }));
          }
        } else if (newRoute) check(await supabase.from('student_route_assignments').insert({ student_id: sid, route_id: newRoute, start_date: today }));
      }
      toast.success(student ? 'Student updated' : 'Student registered');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save student'); } finally { setSaving(false); }
  };

  const schoolRoutes = routes.filter(r => r.school_id === schoolId);
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Student full name *" error={errors.full_name?.message}><Input {...register('full_name')} /></Field>
      <Field label="School *" error={errors.school_id?.message}><Select {...register('school_id')}><option value="">Select school…</option>{schools.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Parent / guardian name *" error={errors.guardian_name?.message}><Input {...register('guardian_name')} /></Field>
      <Field label="Guardian telephone *" error={errors.guardian_phone?.message}><Input type="tel" {...register('guardian_phone')} /></Field>
      <Field label="Secondary contact" error={errors.secondary_contact?.message}><Input type="tel" {...register('secondary_contact')} /></Field>
      <Field label="Monthly transport fee *" error={errors.monthly_fee?.message}><Input inputMode="decimal" {...register('monthly_fee')} /></Field>
      <Field label="Home pickup location"><Input {...register('pickup_location')} /></Field>
      <Field label="Drop-off location"><Input {...register('dropoff_location')} /></Field>
      <Field label="Assigned route" hint={schoolId ? (schoolRoutes.length ? 'Changing the route keeps the old assignment in history.' : 'No routes for this school yet.') : 'Choose a school first.'}>
        <Select {...register('route_id')}><option value="">No route</option>{schoolRoutes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
      </Field>
      <Field label="Assigned vehicle"><Select {...register('vehicle_id')}><option value="">None</option>{vehicles.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Start date *" error={errors.start_date?.message}><Input type="date" {...register('start_date')} /></Field>
      <Field label="End date" error={errors.end_date?.message}><Input type="date" {...register('end_date')} /></Field>
      <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="paused">Temporarily paused</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></Select></Field>
      <Field label="Special operational notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={student ? 'Save changes' : 'Register student'} /></div>
    </form>
  );
};

export const AdminStudents: React.FC = () => {
  const { settings } = useSettings();
  const [search, setSearch] = useState('');
  const [school, setSchool] = useState('all');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Student | 'new' | null>(null);

  const opts = useQuery(async () => {
    const [sc, ve, ro] = await Promise.all([
      supabase.from('schools').select('id,name').eq('is_archived', false).order('name'),
      supabase.from('vehicles').select('id,name').eq('is_archived', false).order('name'),
      supabase.from('transport_routes').select('id,name,school_id').eq('status', 'active').order('name'),
    ]);
    return { schools: unwrap(sc) as Opt[], vehicles: unwrap(ve) as Opt[], routes: unwrap(ro) as RouteOpt[] };
  }, { schools: [] as Opt[], vehicles: [] as Opt[], routes: [] as RouteOpt[] });

  const list = useQuery(async () => {
    let q = supabase.from('students').select('*, schools(name), vehicles(name)', { count: 'exact' }).order('full_name').range(page * PAGE, page * PAGE + PAGE - 1);
    if (school !== 'all') q = q.eq('school_id', school);
    if (status !== 'all') q = q.eq('status', status);
    const t = sanitizeSearch(search);
    if (t) q = q.or(`full_name.ilike.%${t}%,guardian_name.ilike.%${t}%,guardian_phone.ilike.%${t}%,student_code.ilike.%${t}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [search, school, status, page]);

  return (
    <div>
      <AdminHeader title="Student Management" subtitle="Private records — visible to administrators only" actions={<Button onClick={() => setEditing('new')} disabled={opts.data.schools.length === 0}><Plus size={18} /> Register student</Button>} />
      {!opts.loading && opts.data.schools.length === 0 && <p className="mb-4 rounded-2xl bg-sunshine-50 text-sunshine-700 text-sm font-semibold p-3">Add a school first, then you can register students.</p>}
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search student, guardian, phone or ID" />
        <Select className="w-52" value={school} onChange={e => { setSchool(e.target.value); setPage(0); }}><option value="all">All schools</option>{opts.data.schools.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        <Select className="w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All statuses</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></Select>
      </div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No students found" message="Registered students will appear here." /></div>
        : <>
          <Table head={['ID', 'Student', 'School', 'Guardian', 'Vehicle', 'Fee', 'Status', '']}>
            {list.data.rows.map(st => (
              <tr key={st.id} className="hover:bg-ink-50">
                <Td>{st.student_code}</Td>
                <Td><Link to={`/admin/students/${st.id}`} className="font-bold hover:text-mint-600">{st.full_name}</Link></Td>
                <Td>{st.schools?.name}</Td><Td>{st.guardian_name}<br /><span className="text-xs text-ink-400">{st.guardian_phone}</span></Td>
                <Td>{st.vehicles?.name ?? '—'}</Td><Td>{formatMoney(st.monthly_fee, settings.currency)}</Td><Td><StatusBadge status={st.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  <Link to={`/admin/students/${st.id}`} title="View" className="inline-flex p-2 rounded-full hover:bg-ink-100"><Eye size={16} /></Link>
                  <button title="Edit" onClick={() => setEditing(st)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Register student' : 'Edit student'}>
        {editing && <StudentForm student={editing === 'new' ? null : editing} schools={opts.data.schools} vehicles={opts.data.vehicles} routes={opts.data.routes} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
    </div>
  );
};

type Inv = { id: string; invoice_number: string; billing_month: string; total_payable: number; amount_paid: number; balance: number; status: string };
type Asg = { id: string; start_date: string; end_date: string | null; transport_routes: { name: string } | null };

export const AdminStudentDetail: React.FC = () => {
  const { id = '' } = useParams();
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const st = useQuery(async () => unwrap(await supabase.from('students').select('*, schools(name), vehicles(name)').eq('id', id).single()) as unknown as Row, null as Row | null, [id]);
  const more = useQuery(async () => {
    const inv = unwrap(await supabase.from('invoices').select('id,invoice_number,billing_month,total_payable,amount_paid,balance,status').eq('student_id', id).order('billing_month', { ascending: false })) as Inv[];
    const asg = unwrap(await supabase.from('student_route_assignments').select('id,start_date,end_date,transport_routes(name)').eq('student_id', id).order('start_date', { ascending: false })) as unknown as Asg[];
    return { inv, asg };
  }, { inv: [] as Inv[], asg: [] as Asg[] }, [id]);

  if (st.loading) return <Skeleton className="h-64" />;
  if (st.error || !st.data) return <ErrorState message={st.error ?? 'Student not found'} />;
  const x = st.data;
  const live = more.data.inv.filter(i => i.status !== 'cancelled');
  const outstanding = live.reduce((a, i) => a + Number(i.balance), 0);
  const paid = live.reduce((a, i) => a + Number(i.amount_paid), 0);

  return (
    <div className="space-y-5">
      <Link to="/admin/students" className="inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-mint-600"><ArrowLeft size={14} /> All students</Link>
      <AdminHeader title={x.full_name} subtitle={`${x.student_code} · ${x.schools?.name}`} actions={<><Link to={`/admin/portal?student=${x.id}`}><Button variant="outline" size="sm"><KeyRound size={15} /> Portal access code</Button></Link><StatusBadge status={x.status} /></>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Monthly fee" value={m(Number(x.monthly_fee))} tone="mint" />
        <StatCard label="Total paid" value={m(paid)} tone="lavender" />
        <StatCard label="Outstanding" value={m(outstanding)} tone={outstanding > 0 ? 'red' : 'ink'} />
      </div>
      <Card title="Personal & transport details">
        <KV items={[['Guardian', x.guardian_name], ['Guardian phone', x.guardian_phone], ['Secondary contact', x.secondary_contact], ['Pickup', x.pickup_location], ['Drop-off', x.dropoff_location],
          ['Vehicle', x.vehicles?.name], ['Start date', x.start_date], ['End date', x.end_date], ['Notes', x.notes]]} />
      </Card>
      <Card title="Route history">
        {more.data.asg.length === 0 ? <p className="text-sm text-ink-500">Not assigned to a route yet.</p> :
          <ul className="divide-y divide-ink-100 text-sm">{more.data.asg.map(a => <li key={a.id} className="py-2 flex justify-between"><span className="font-bold">{a.transport_routes?.name}</span><span>{a.start_date} → {a.end_date ?? 'present'}</span></li>)}</ul>}
      </Card>
      <Card title="Invoices & payment history">
        {more.data.inv.length === 0 ? <p className="text-sm text-ink-500">No invoices yet. Monthly invoices are generated in the billing module (Phase 3).</p> :
          <Table head={['Invoice', 'Month', 'Payable', 'Paid', 'Balance', 'Status']}>{more.data.inv.map(i => (
            <tr key={i.id}><Td>{i.invoice_number}</Td><Td>{format(new Date(i.billing_month + 'T00:00:00'), 'MMM yyyy')}</Td><Td>{m(Number(i.total_payable))}</Td><Td>{m(Number(i.amount_paid))}</Td><Td>{m(Number(i.balance))}</Td><Td><StatusBadge status={i.status} /></Td></tr>))}
          </Table>}
      </Card>
    </div>
  );
};
