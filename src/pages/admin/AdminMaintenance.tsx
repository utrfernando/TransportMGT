import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { AlertTriangle, Paperclip, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { supabase, type Maintenance } from '../../lib/supabase';
import { check, daysUntil, unwrap } from '../../lib/db';
import { openPrivate, removePrivate, uploadPrivate } from '../../lib/files';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, Table, Td } from '../../components/admin/ui';
import { ExpiryDate, FormActions } from '../../components/admin/crud';
import FileField from '../../components/admin/FileField';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 12;
const CATS: [string, string][] = [['oil_change', 'Oil change'], ['engine_repair', 'Engine repair'], ['tyre_replacement', 'Tyre replacement'], ['battery_replacement', 'Battery replacement'], ['general_service', 'General servicing'], ['electrical_repair', 'Electrical repair'], ['other', 'Other repair']];
const label = (c: string) => CATS.find(x => x[0] === c)?.[1] ?? c;
type Row = Maintenance & { vehicles: { name: string } | null };
type VOpt = { id: string; name: string; odometer_km: number };

const num = (msg: string) => z.string().refine(v => v === '' || (!isNaN(Number(v)) && Number(v) >= 0), msg);
const schema = z.object({
  vehicle_id: z.string().min(1, 'Choose a vehicle'), service_date: z.string().min(1, 'Required'),
  category: z.enum(['oil_change', 'engine_repair', 'tyre_replacement', 'battery_replacement', 'general_service', 'electrical_repair', 'other']),
  description: z.string().max(300), service_provider: z.string().max(120), cost: num('Enter a valid cost'), odometer_km: num('Enter a valid reading'),
  next_service_date: z.string(), next_service_odometer_km: num('Enter a valid reading'),
}).refine(v => !v.next_service_date || v.next_service_date >= v.service_date, { path: ['next_service_date'], message: 'Next service must be after this service' });
type V = z.infer<typeof schema>;
const s0 = (v: string) => (v.trim() === '' ? null : v.trim());
const n0 = (v: string) => (v === '' ? null : Number(v));

const MaintForm: React.FC<{ rec: Row | null; vehicles: VOpt[]; onDone: () => void; onCancel: () => void }> = ({ rec, vehicles, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { vehicle_id: rec?.vehicle_id ?? '', service_date: rec?.service_date ?? format(new Date(), 'yyyy-MM-dd'), category: rec?.category ?? 'general_service', description: rec?.description ?? '',
      service_provider: rec?.service_provider ?? '', cost: rec?.cost?.toString() ?? '', odometer_km: rec?.odometer_km?.toString() ?? '', next_service_date: rec?.next_service_date ?? '', next_service_odometer_km: rec?.next_service_odometer_km?.toString() ?? '' },
  });
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      let receipt = removed ? null : rec?.receipt_path ?? null;
      if (file) receipt = await uploadPrivate(file, 'receipts/maintenance');
      const row = { vehicle_id: v.vehicle_id, service_date: v.service_date, category: v.category, description: s0(v.description), service_provider: s0(v.service_provider), cost: n0(v.cost) ?? 0,
        odometer_km: n0(v.odometer_km), next_service_date: s0(v.next_service_date), next_service_odometer_km: n0(v.next_service_odometer_km), receipt_path: receipt };
      check(rec ? await supabase.from('vehicle_maintenance').update(row).eq('id', rec.id) : await supabase.from('vehicle_maintenance').insert(row));
      if (rec?.receipt_path && rec.receipt_path !== receipt) await removePrivate(rec.receipt_path);
      toast.success(rec ? 'Maintenance record updated' : 'Maintenance recorded'); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Vehicle *" error={errors.vehicle_id?.message}><Select {...register('vehicle_id')}><option value="">Select…</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
      <Field label="Service date *" error={errors.service_date?.message}><Input type="date" {...register('service_date')} /></Field>
      <Field label="Category"><Select {...register('category')}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Service provider"><Input {...register('service_provider')} /></Field>
      <Field label="Description" className="sm:col-span-2"><Input {...register('description')} /></Field>
      <Field label="Cost" error={errors.cost?.message} hint="Creates a linked Maintenance expense when above 0"><Input inputMode="decimal" {...register('cost')} /></Field>
      <Field label="Odometer (km)" error={errors.odometer_km?.message}><Input inputMode="decimal" {...register('odometer_km')} /></Field>
      <Field label="Next service date" error={errors.next_service_date?.message}><Input type="date" {...register('next_service_date')} /></Field>
      <Field label="Next service odometer (km)" error={errors.next_service_odometer_km?.message}><Input inputMode="decimal" {...register('next_service_odometer_km')} /></Field>
      <div className="sm:col-span-2"><FileField label="Invoice / receipt" existingPath={rec?.receipt_path ?? null} file={file} removed={removed} onFile={setFile} onRemoveExisting={() => setRemoved(true)} /></div>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={rec ? 'Save changes' : 'Record maintenance'} /></div>
    </form>
  );
};

type Due = { key: string; vehicle: string; category: string; why: string; overdue: boolean };

const AdminMaintenance: React.FC = () => {
  const { settings } = useSettings();
  const toast = useToast();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [vehicle, setVehicle] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [del, setDel] = useState<Row | null>(null);

  const vehicles = useQuery(async () => unwrap(await supabase.from('vehicles').select('id,name,odometer_km').eq('is_archived', false).order('name')) as VOpt[], [] as VOpt[]);

  const list = useQuery(async () => {
    let q = supabase.from('vehicle_maintenance').select('*, vehicles(name)', { count: 'exact' }).order('service_date', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (vehicle !== 'all') q = q.eq('vehicle_id', vehicle);
    if (category !== 'all') q = q.eq('category', category);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [vehicle, category, page]);

  // reminders: newest record per vehicle+category that has a "next service" target
  const due = useQuery(async () => {
    const [recs, prefs] = await Promise.all([
      supabase.from('vehicle_maintenance').select('vehicle_id,category,service_date,next_service_date,next_service_odometer_km, vehicles(name,odometer_km,is_archived)').order('service_date', { ascending: false }),
      supabase.from('business_settings').select('notification_prefs').eq('id', 1).single(),
    ]);
    const days = (prefs.data as { notification_prefs: { service_reminder_days: number } } | null)?.notification_prefs?.service_reminder_days ?? 14;
    const seen = new Set<string>(); const out: Due[] = [];
    for (const r of unwrap(recs) as unknown as { vehicle_id: string; category: string; next_service_date: string | null; next_service_odometer_km: number | null; vehicles: { name: string; odometer_km: number; is_archived: boolean } | null }[]) {
      const k = `${r.vehicle_id}|${r.category}`; if (seen.has(k)) continue; seen.add(k);
      if (!r.vehicles || r.vehicles.is_archived) continue;
      const d = daysUntil(r.next_service_date);
      if (d !== null && d <= days) out.push({ key: k + 'd', vehicle: r.vehicles.name, category: r.category, overdue: d < 0, why: d < 0 ? `Overdue by ${-d} day(s)` : d === 0 ? 'Due today' : `Due in ${d} day(s)` });
      if (r.next_service_odometer_km !== null) {
        const left = Number(r.next_service_odometer_km) - Number(r.vehicles.odometer_km);
        if (left <= 500) out.push({ key: k + 'o', vehicle: r.vehicles.name, category: r.category, overdue: left < 0, why: left < 0 ? `Over by ${Math.round(-left)} km` : `${Math.round(left)} km remaining` });
      }
    }
    return out.sort((a, b) => Number(b.overdue) - Number(a.overdue));
  }, [] as Due[]);

  const reload = () => { list.reload(); due.reload(); };
  const doDelete = async () => {
    if (!del) return;
    try { check(await supabase.from('vehicle_maintenance').delete().eq('id', del.id)); if (del.receipt_path) await removePrivate(del.receipt_path); toast.success('Record and linked expense deleted'); setDel(null); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <AdminHeader title="Vehicle Maintenance" subtitle="Service history, costs and reminders" actions={<Button onClick={() => setEditing('new')} disabled={vehicles.data.length === 0}><Plus size={18} /> Record maintenance</Button>} />

      <Card title="Upcoming & overdue servicing" className="mb-6">
        {due.loading ? <Skeleton className="h-16" /> : due.data.length === 0 ? <p className="flex items-center gap-2 text-sm text-ink-500"><Wrench size={16} /> Nothing due. Set a “next service” date or odometer on a record to get reminders here.</p> :
          <ul className="divide-y divide-ink-100 text-sm">{due.data.map(d => (
            <li key={d.key} className="py-2 flex items-center justify-between gap-2"><span className="font-bold">{d.vehicle} <span className="font-semibold text-ink-500">· {label(d.category)}</span></span>
              <Badge color={d.overdue ? 'red' : 'sunshine'}>{d.overdue && <AlertTriangle size={12} />} {d.why}</Badge></li>))}</ul>}
      </Card>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Vehicle" className="w-48"><Select value={vehicle} onChange={e => { setVehicle(e.target.value); setPage(0); }}><option value="all">All vehicles</option>{vehicles.data.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label="Category" className="w-52"><Select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">All</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No maintenance records" message="Record servicing and repairs to build each vehicle's history." actionLabel="Record maintenance" onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['Date', 'Vehicle', 'Type', 'Provider', 'Cost', 'Odometer', 'Next service', '']}>
            {list.data.rows.map(r => (
              <tr key={r.id} className="hover:bg-ink-50"><Td>{r.service_date}</Td><Td className="font-bold">{r.vehicles?.name}</Td><Td>{label(r.category)}<br /><span className="text-xs text-ink-400">{r.description}</span></Td>
                <Td>{r.service_provider ?? '—'}</Td><Td className="font-bold">{Number(r.cost) ? m(Number(r.cost)) : '—'}</Td><Td>{r.odometer_km ?? '—'}</Td>
                <Td><ExpiryDate date={r.next_service_date} warnDays={14} />{r.next_service_odometer_km && <span className="block text-xs text-ink-400">{r.next_service_odometer_km} km</span>}</Td>
                <Td className="whitespace-nowrap text-right">
                  {r.receipt_path && <button title="View invoice" onClick={() => openPrivate(r.receipt_path!).catch(er => toast.error(er.message))} className="p-2 rounded-full hover:bg-ink-100"><Paperclip size={16} /></button>}
                  <button title="Edit" onClick={() => setEditing(r)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  <button title="Delete" onClick={() => setDel(r)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><Trash2 size={16} /></button></Td></tr>))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Record maintenance' : 'Edit maintenance'}>
        {editing && <MaintForm rec={editing === 'new' ? null : editing} vehicles={vehicles.data} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete maintenance record?" confirmLabel="Delete" message="Its linked expense is removed too. The deletion is kept in the audit log." onClose={() => setDel(null)} onConfirm={doDelete} />
    </div>
  );
};

export default AdminMaintenance;
