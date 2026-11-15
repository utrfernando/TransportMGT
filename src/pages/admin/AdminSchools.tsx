import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, ArchiveRestore, ArrowLeft, Eye, Pencil, Plus } from 'lucide-react';
import { supabase, type School } from '../../lib/supabase';
import { check, sanitizeSearch, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { FormActions, KV, SearchBox, StatusBadge } from '../../components/admin/crud';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 12;
const schema = z.object({
  name: z.string().trim().min(2, 'Required').max(150), address: z.string().max(300), contact_person: z.string().max(100),
  contact_phone: z.string().trim().regex(/^([0-9+()\-\s]{7,20})?$/, 'Enter a valid phone number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')), agreement_details: z.string().max(2000),
  start_date: z.string(), status: z.enum(['active', 'inactive']), notes: z.string().max(1000),
});
type V = z.infer<typeof schema>;
const s = (v: string) => (v.trim() === '' ? null : v.trim());

const SchoolForm: React.FC<{ school: School | null; onDone: () => void; onCancel: () => void }> = ({ school, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { name: school?.name ?? '', address: school?.address ?? '', contact_person: school?.contact_person ?? '', contact_phone: school?.contact_phone ?? '',
      email: school?.email ?? '', agreement_details: school?.agreement_details ?? '', start_date: school?.start_date ?? '', status: school?.status ?? 'active', notes: school?.notes ?? '' },
  });
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      const row = { name: v.name, address: s(v.address), contact_person: s(v.contact_person), contact_phone: s(v.contact_phone), email: s(v.email),
        agreement_details: s(v.agreement_details), start_date: s(v.start_date), status: v.status, notes: s(v.notes) };
      check(school ? await supabase.from('schools').update(row).eq('id', school.id) : await supabase.from('schools').insert(row));
      toast.success(school ? 'School updated' : 'School added'); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save school'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="School name *" error={errors.name?.message} className="sm:col-span-2"><Input {...register('name')} /></Field>
      <Field label="Address" className="sm:col-span-2"><Input {...register('address')} /></Field>
      <Field label="Contact person"><Input {...register('contact_person')} /></Field>
      <Field label="Contact number" error={errors.contact_phone?.message}><Input type="tel" {...register('contact_phone')} /></Field>
      <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
      <Field label="Service starting date"><Input type="date" {...register('start_date')} /></Field>
      <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
      <Field label="Service agreement details" className="sm:col-span-2"><Textarea rows={3} {...register('agreement_details')} /></Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={school ? 'Save changes' : 'Add school'} /></div>
    </form>
  );
};

export const AdminSchools: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<School | 'new' | null>(null);
  const [toArchive, setToArchive] = useState<School | null>(null);

  const list = useQuery(async () => {
    let q = supabase.from('schools').select('*', { count: 'exact' }).eq('is_archived', archived).order('name').range(page * PAGE, page * PAGE + PAGE - 1);
    const t = sanitizeSearch(search);
    if (t) q = q.or(`name.ilike.%${t}%,contact_person.ilike.%${t}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as School[], total: count ?? 0 };
  }, { rows: [] as School[], total: 0 }, [search, archived, page]);

  const setFlag = async (sc: School, flag: boolean) => {
    try { check(await supabase.from('schools').update({ is_archived: flag, ...(flag ? { status: 'inactive' } : {}) }).eq('id', sc.id)); toast.success(flag ? 'School archived' : 'School restored'); setToArchive(null); list.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <AdminHeader title="School Management" subtitle="Schools you provide transport for" actions={<Button onClick={() => setEditing('new')}><Plus size={18} /> Add school</Button>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search school or contact person" />
        <label className="flex items-center gap-2 text-sm font-bold text-ink-600"><input type="checkbox" className="h-4 w-4 accent-teal-500" checked={archived} onChange={e => { setArchived(e.target.checked); setPage(0); }} /> Archived</label>
      </div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No schools yet" message="Add a school, then register its students." actionLabel={archived ? undefined : 'Add school'} onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['School', 'Contact', 'Phone', 'Since', 'Status', '']}>
            {list.data.rows.map(sc => (
              <tr key={sc.id} className="hover:bg-ink-50">
                <Td><Link to={`/admin/schools/${sc.id}`} className="font-bold hover:text-mint-600">{sc.name}</Link></Td>
                <Td>{sc.contact_person ?? '—'}</Td><Td>{sc.contact_phone ?? '—'}</Td><Td>{sc.start_date ?? '—'}</Td><Td><StatusBadge status={sc.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  <Link to={`/admin/schools/${sc.id}`} title="View" className="inline-flex p-2 rounded-full hover:bg-ink-100"><Eye size={16} /></Link>
                  <button title="Edit" onClick={() => setEditing(sc)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  {archived ? <button title="Restore" onClick={() => setFlag(sc, false)} className="p-2 rounded-full hover:bg-ink-100"><ArchiveRestore size={16} /></button>
                    : <button title="Archive" onClick={() => setToArchive(sc)} className="p-2 rounded-full hover:bg-ink-100"><Archive size={16} /></button>}
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add school' : 'Edit school'}>
        {editing && <SchoolForm school={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!toArchive} title="Archive school?" confirmLabel="Archive" message={`${toArchive?.name} will be hidden from lists. Students, invoices and payments are kept.`} onClose={() => setToArchive(null)} onConfirm={() => toArchive && setFlag(toArchive, true)} />
    </div>
  );
};

type StudentRow = { id: string; student_code: string; full_name: string; monthly_fee: number; status: string; vehicles: { name: string } | null };

export const AdminSchoolDetail: React.FC = () => {
  const { id = '' } = useParams();
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const sc = useQuery(async () => unwrap(await supabase.from('schools').select('*').eq('id', id).single()) as School, null as School | null, [id]);
  const data = useQuery(async () => {
    const students = unwrap(await supabase.from('students').select('id,student_code,full_name,monthly_fee,status,vehicles(name)').eq('school_id', id).order('full_name')) as unknown as StudentRow[];
    const routes = unwrap(await supabase.from('transport_routes').select('id,name,status,vehicles(name)').eq('school_id', id)) as unknown as { id: string; name: string; status: string; vehicles: { name: string } | null }[];
    const inv = unwrap(await supabase.from('invoices').select('total_payable,amount_paid,balance,status').eq('school_id', id).neq('status', 'cancelled')) as { total_payable: number; amount_paid: number; balance: number }[];
    return { students, routes, inv };
  }, { students: [] as StudentRow[], routes: [] as { id: string; name: string; status: string; vehicles: { name: string } | null }[], inv: [] as { total_payable: number; amount_paid: number; balance: number }[] }, [id]);

  if (sc.loading) return <Skeleton className="h-64" />;
  if (sc.error || !sc.data) return <ErrorState message={sc.error ?? 'School not found'} />;
  const x = sc.data;
  const active = data.data.students.filter(st => st.status === 'active');
  const expected = active.reduce((a, st) => a + Number(st.monthly_fee), 0);
  const collected = data.data.inv.reduce((a, i) => a + Number(i.amount_paid), 0);
  const outstanding = data.data.inv.reduce((a, i) => a + Number(i.balance), 0);
  const vehicles = Array.from(new Set(data.data.routes.map(r => r.vehicles?.name).filter(Boolean)));

  return (
    <div className="space-y-5">
      <Link to="/admin/schools" className="inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-mint-600"><ArrowLeft size={14} /> All schools</Link>
      <AdminHeader title={x.name} subtitle={x.address ?? undefined} actions={<StatusBadge status={x.status} />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Registered students" value={String(active.length)} hint={`${data.data.students.length} total`} tone="lavender" />
        <StatCard label="Expected monthly revenue" value={m(expected)} tone="mint" />
        <StatCard label="Collected (invoices)" value={m(collected)} tone="sunshine" />
        <StatCard label="Outstanding" value={m(outstanding)} tone={outstanding > 0 ? 'red' : 'ink'} />
      </div>
      <Card title="Agreement & contact"><KV items={[['Contact person', x.contact_person], ['Phone', x.contact_phone], ['Email', x.email], ['Service since', x.start_date], ['Assigned vehicles', vehicles.join(', ') || null], ['Agreement', x.agreement_details], ['Notes', x.notes]]} /></Card>
      <Card title={`Students (${data.data.students.length})`}>
        {data.data.students.length === 0 ? <p className="text-sm text-ink-500">No students registered for this school.</p> :
          <Table head={['ID', 'Student', 'Vehicle', 'Monthly fee', 'Status']}>{data.data.students.map(st => (
            <tr key={st.id}><Td>{st.student_code}</Td><Td><Link className="font-bold hover:text-mint-600" to={`/admin/students/${st.id}`}>{st.full_name}</Link></Td><Td>{st.vehicles?.name ?? '—'}</Td><Td>{m(Number(st.monthly_fee))}</Td><Td><StatusBadge status={st.status} /></Td></tr>))}
          </Table>}
      </Card>
      <Card title="Routes">
        {data.data.routes.length === 0 ? <p className="text-sm text-ink-500">No routes for this school yet.</p> :
          <ul className="divide-y divide-ink-100 text-sm">{data.data.routes.map(r => <li key={r.id} className="py-2 flex justify-between"><span className="font-bold">{r.name}</span><span>{r.vehicles?.name ?? 'No vehicle'}</span><StatusBadge status={r.status} /></li>)}</ul>}
      </Card>
    </div>
  );
};
