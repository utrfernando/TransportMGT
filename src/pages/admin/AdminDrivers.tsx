import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, ArchiveRestore, Eye, Pencil, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { supabase, type Driver } from '../../lib/supabase';
import { check, sanitizeSearch, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { ExpiryDate, FormActions, KV, SearchBox, StatusBadge } from '../../components/admin/crud';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 12;
type Row = Driver & { vehicles: { name: string } | null };

const schema = z.object({
  full_name: z.string().trim().min(2, 'Required').max(100),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid phone number'),
  address: z.string().max(300), licence_number: z.string().trim().max(30), licence_expiry: z.string(),
  emergency_contact: z.string().max(100), assigned_vehicle_id: z.string(), is_owner: z.boolean(),
  status: z.enum(['active', 'inactive', 'on_leave']), notes: z.string().max(1000),
});
type V = z.infer<typeof schema>;
const s = (v: string) => (v.trim() === '' ? null : v.trim());

const DriverForm: React.FC<{ driver: Driver | null; vehicles: { id: string; name: string }[]; onDone: () => void; onCancel: () => void }> = ({ driver, vehicles, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: driver?.full_name ?? '', phone: driver?.phone ?? '', address: driver?.address ?? '', licence_number: driver?.licence_number ?? '',
      licence_expiry: driver?.licence_expiry ?? '', emergency_contact: driver?.emergency_contact ?? '', assigned_vehicle_id: driver?.assigned_vehicle_id ?? '',
      is_owner: driver?.is_owner ?? false, status: driver?.status ?? 'active', notes: driver?.notes ?? '',
    },
  });
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      const row = { full_name: v.full_name, phone: v.phone, address: s(v.address), licence_number: s(v.licence_number), licence_expiry: s(v.licence_expiry),
        emergency_contact: s(v.emergency_contact), assigned_vehicle_id: s(v.assigned_vehicle_id), is_owner: v.is_owner, status: v.status, notes: s(v.notes) };
      check(driver ? await supabase.from('drivers').update(row).eq('id', driver.id) : await supabase.from('drivers').insert(row));
      toast.success(driver ? 'Driver updated' : 'Driver added');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save driver'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Driver name *" error={errors.full_name?.message}><Input {...register('full_name')} /></Field>
      <Field label="Contact number *" error={errors.phone?.message}><Input type="tel" {...register('phone')} /></Field>
      <Field label="Driving licence number"><Input {...register('licence_number')} className="uppercase" /></Field>
      <Field label="Licence expiry"><Input type="date" {...register('licence_expiry')} /></Field>
      <Field label="Emergency contact"><Input {...register('emergency_contact')} placeholder="Name and number" /></Field>
      <Field label="Assigned vehicle"><Select {...register('assigned_vehicle_id')}><option value="">None</option>{vehicles.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
      <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="on_leave">On leave</option><option value="inactive">Inactive</option></Select></Field>
      <label className="flex items-center gap-3 font-bold text-ink-700 sm:pt-7"><input type="checkbox" className="h-5 w-5 accent-teal-500" {...register('is_owner')} /> This is the business owner</label>
      <Field label="Address" className="sm:col-span-2"><Input {...register('address')} /></Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={driver ? 'Save changes' : 'Add driver'} /></div>
    </form>
  );
};

const DriverDetail: React.FC<{ driver: Row }> = ({ driver }) => {
  const { settings } = useSettings();
  const q = useQuery(async () => {
    const bookings = unwrap(await supabase.from('hire_bookings').select('id,reference,start_at,status,hire_type').eq('assigned_driver_id', driver.id).order('start_at', { ascending: false })) as { id: string; reference: string; start_at: string; status: string; hire_type: string }[];
    const pay = unwrap(await supabase.from('booking_driver_assignments').select('agreed_fee,advance_paid,payment_status').eq('driver_id', driver.id)) as { agreed_fee: number; advance_paid: number; payment_status: string }[];
    return { bookings, pay };
  }, { bookings: [] as { id: string; reference: string; start_at: string; status: string; hire_type: string }[], pay: [] as { agreed_fee: number; advance_paid: number; payment_status: string }[] }, [driver.id]);
  const completed = q.data.bookings.filter(b => b.status === 'completed').length;
  const fees = q.data.pay.reduce((a, p) => a + Number(p.agreed_fee), 0);
  const pending = q.data.pay.filter(p => p.payment_status !== 'paid').reduce((a, p) => a + Number(p.agreed_fee) - Number(p.advance_paid), 0);
  const upcoming = q.data.bookings.filter(b => ['confirmed', 'in_progress'].includes(b.status) && new Date(b.start_at) >= new Date()).length;
  return (
    <div className="space-y-5">
      <KV items={[['Phone', driver.phone], ['Licence', driver.licence_number], ['Licence expiry', <ExpiryDate date={driver.licence_expiry} />], ['Emergency contact', driver.emergency_contact],
        ['Vehicle', driver.vehicles?.name], ['Availability', upcoming ? `${upcoming} upcoming booking(s)` : 'Free'], ['Address', driver.address], ['Notes', driver.notes]]} />
      {q.loading ? <Skeleton className="h-24" /> : <>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Assigned" value={String(q.data.bookings.length)} tone="mint" />
          <StatCard label="Completed trips" value={String(completed)} tone="lavender" />
          <StatCard label="Pending pay" value={formatMoney(pending, settings.currency)} hint={`Total fees ${formatMoney(fees, settings.currency)}`} tone="sunshine" />
        </div>
        {q.data.bookings.length === 0 ? <p className="text-sm text-ink-500">No bookings assigned yet.</p> :
          <ul className="divide-y divide-ink-100 text-sm">{q.data.bookings.slice(0, 8).map(b => <li key={b.id} className="py-2 flex justify-between"><span className="font-bold">{b.reference}</span><span>{format(new Date(b.start_at), 'dd MMM yyyy')}</span><StatusBadge status={b.status} /></li>)}</ul>}
      </>}
    </div>
  );
};

const AdminDrivers: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Driver | 'new' | null>(null);
  const [viewing, setViewing] = useState<Row | null>(null);
  const [toArchive, setToArchive] = useState<Row | null>(null);

  const vehicles = useQuery(async () => unwrap(await supabase.from('vehicles').select('id,name').eq('is_archived', false).order('name')) as { id: string; name: string }[], []);
  const list = useQuery(async () => {
    let q = supabase.from('drivers').select('*, vehicles(name)', { count: 'exact' }).eq('is_archived', archived).order('full_name').range(page * PAGE, page * PAGE + PAGE - 1);
    const t = sanitizeSearch(search);
    if (t) q = q.or(`full_name.ilike.%${t}%,phone.ilike.%${t}%,licence_number.ilike.%${t}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [search, archived, page]);

  const setFlag = async (dr: Row, flag: boolean) => {
    try { check(await supabase.from('drivers').update({ is_archived: flag, ...(flag ? { status: 'inactive' } : {}) }).eq('id', dr.id)); toast.success(flag ? 'Driver archived' : 'Driver restored'); setToArchive(null); list.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <AdminHeader title="Driver Management" subtitle="Owner-drivers and external drivers" actions={<Button onClick={() => setEditing('new')}><Plus size={18} /> Add driver</Button>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search name, phone or licence" />
        <label className="flex items-center gap-2 text-sm font-bold text-ink-600"><input type="checkbox" className="h-4 w-4 accent-teal-500" checked={archived} onChange={e => { setArchived(e.target.checked); setPage(0); }} /> Archived</label>
      </div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No drivers yet" message="Add the owner and any external drivers you use." actionLabel={archived ? undefined : 'Add driver'} onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['Driver', 'Phone', 'Licence expiry', 'Vehicle', 'Status', '']}>
            {list.data.rows.map(dr => (
              <tr key={dr.id} className="hover:bg-ink-50">
                <Td className="font-bold">{dr.full_name} {dr.is_owner && <Badge color="sunshine">Owner</Badge>}</Td>
                <Td>{dr.phone}</Td><Td><ExpiryDate date={dr.licence_expiry} /></Td><Td>{dr.vehicles?.name ?? '—'}</Td><Td><StatusBadge status={dr.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  <button title="View" onClick={() => setViewing(dr)} className="p-2 rounded-full hover:bg-ink-100"><Eye size={16} /></button>
                  <button title="Edit" onClick={() => setEditing(dr)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  {archived ? <button title="Restore" onClick={() => setFlag(dr, false)} className="p-2 rounded-full hover:bg-ink-100"><ArchiveRestore size={16} /></button>
                    : <button title="Archive" onClick={() => setToArchive(dr)} className="p-2 rounded-full hover:bg-ink-100"><Archive size={16} /></button>}
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add driver' : 'Edit driver'}>
        {editing && <DriverForm driver={editing === 'new' ? null : editing} vehicles={vehicles.data} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <Modal open={!!viewing} onClose={() => setViewing(null)} wide title={viewing?.full_name}>{viewing && <DriverDetail driver={viewing} />}</Modal>
      <ConfirmDialog open={!!toArchive} title="Archive driver?" confirmLabel="Archive" message={`${toArchive?.full_name} will no longer be selectable for new bookings. Past records are kept.`} onClose={() => setToArchive(null)} onConfirm={() => toArchive && setFlag(toArchive, true)} />
    </div>
  );
};

export default AdminDrivers;
