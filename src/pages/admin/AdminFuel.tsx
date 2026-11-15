import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { Fuel, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, type FuelRecord } from '../../lib/supabase';
import { check, unwrap } from '../../lib/db';
import { openPrivate, removePrivate, uploadPrivate } from '../../lib/files';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { FormActions } from '../../components/admin/crud';
import FileField from '../../components/admin/FileField';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 15;
type Row = FuelRecord & { vehicles: { name: string } | null };
type VOpt = { id: string; name: string; fuel_type: string };

const schema = z.object({
  vehicle_id: z.string().min(1, 'Choose a vehicle'), fuel_date: z.string().min(1, 'Required'),
  fuel_type: z.enum(['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other']),
  litres: z.string().refine(v => v !== '' && Number(v) > 0, 'Enter litres above zero'),
  total_cost: z.string().refine(v => v !== '' && Number(v) > 0, 'Enter the total cost'),
  odometer_km: z.string().refine(v => v === '' || (!isNaN(Number(v)) && Number(v) >= 0), 'Enter a valid reading'),
  fuel_station: z.string().max(120), notes: z.string().max(500),
});
type V = z.infer<typeof schema>;
const s0 = (v: string) => (v.trim() === '' ? null : v.trim());

const FuelForm: React.FC<{ rec: Row | null; vehicles: VOpt[]; onDone: () => void; onCancel: () => void }> = ({ rec, vehicles, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const { register, handleSubmit, setError, setValue, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { vehicle_id: rec?.vehicle_id ?? '', fuel_date: rec?.fuel_date ?? format(new Date(), 'yyyy-MM-dd'), fuel_type: rec?.fuel_type ?? 'diesel', litres: rec?.litres?.toString() ?? '', total_cost: rec?.total_cost?.toString() ?? '', odometer_km: rec?.odometer_km?.toString() ?? '', fuel_station: rec?.fuel_station ?? '', notes: rec?.notes ?? '' },
  });

  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      if (v.odometer_km !== '') {
        const odo = Number(v.odometer_km);
        const prev = (await supabase.from('fuel_records').select('odometer_km').eq('vehicle_id', v.vehicle_id).not('odometer_km', 'is', null).lte('fuel_date', v.fuel_date).neq('id', rec?.id ?? '00000000-0000-0000-0000-000000000000').order('fuel_date', { ascending: false }).order('odometer_km', { ascending: false }).limit(1)).data?.[0] as { odometer_km: number } | undefined;
        const next = (await supabase.from('fuel_records').select('odometer_km').eq('vehicle_id', v.vehicle_id).not('odometer_km', 'is', null).gt('fuel_date', v.fuel_date).neq('id', rec?.id ?? '00000000-0000-0000-0000-000000000000').order('fuel_date').limit(1)).data?.[0] as { odometer_km: number } | undefined;
        if (prev && odo < Number(prev.odometer_km)) { setError('odometer_km', { message: `Lower than the earlier reading (${prev.odometer_km} km)` }); return; }
        if (next && odo > Number(next.odometer_km)) { setError('odometer_km', { message: `Higher than a later reading (${next.odometer_km} km)` }); return; }
      }
      let receipt = removed ? null : rec?.receipt_path ?? null;
      if (file) receipt = await uploadPrivate(file, 'receipts/fuel');
      const row = { vehicle_id: v.vehicle_id, fuel_date: v.fuel_date, fuel_type: v.fuel_type, litres: Number(v.litres), total_cost: Number(v.total_cost), odometer_km: v.odometer_km === '' ? null : Number(v.odometer_km), fuel_station: s0(v.fuel_station), notes: s0(v.notes), receipt_path: receipt };
      check(rec ? await supabase.from('fuel_records').update(row).eq('id', rec.id) : await supabase.from('fuel_records').insert(row));
      if (rec?.receipt_path && rec.receipt_path !== receipt) await removePrivate(rec.receipt_path);
      toast.success(rec ? 'Fuel record updated' : 'Fuel purchase recorded (expense created automatically)'); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Vehicle *" error={errors.vehicle_id?.message}>
        <Select {...register('vehicle_id', { onChange: e => { const v = vehicles.find(x => x.id === e.target.value); if (v && ['petrol', 'diesel', 'hybrid', 'electric', 'lpg'].includes(v.fuel_type)) setValue('fuel_type', v.fuel_type as V['fuel_type']); } })}><option value="">Select…</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
      </Field>
      <Field label="Date *" error={errors.fuel_date?.message}><Input type="date" max={format(new Date(), 'yyyy-MM-dd')} {...register('fuel_date')} /></Field>
      <Field label="Fuel type"><Select {...register('fuel_type')}>{['diesel', 'petrol', 'hybrid', 'electric', 'lpg', 'other'].map(f => <option key={f} value={f}>{f}</option>)}</Select></Field>
      <Field label="Litres *" error={errors.litres?.message}><Input inputMode="decimal" {...register('litres')} /></Field>
      <Field label="Total cost *" error={errors.total_cost?.message}><Input inputMode="decimal" {...register('total_cost')} /></Field>
      <Field label="Odometer (km)" error={errors.odometer_km?.message}><Input inputMode="decimal" {...register('odometer_km')} /></Field>
      <Field label="Fuel station" className="sm:col-span-2"><Input {...register('fuel_station')} /></Field>
      <div className="sm:col-span-2"><FileField label="Receipt" existingPath={rec?.receipt_path ?? null} file={file} removed={removed} onFile={setFile} onRemoveExisting={() => setRemoved(true)} /></div>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={rec ? 'Save changes' : 'Record purchase'} /></div>
    </form>
  );
};

const AdminFuel: React.FC = () => {
  const { settings } = useSettings();
  const toast = useToast();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [vehicle, setVehicle] = useState('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [del, setDel] = useState<Row | null>(null);

  const vehicles = useQuery(async () => unwrap(await supabase.from('vehicles').select('id,name,fuel_type').eq('is_archived', false).order('name')) as VOpt[], [] as VOpt[]);

  const list = useQuery(async () => {
    let q = supabase.from('fuel_records').select('*, vehicles(name)', { count: 'exact' }).gte('fuel_date', from).lte('fuel_date', to).order('fuel_date', { ascending: false }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (vehicle !== 'all') q = q.eq('vehicle_id', vehicle);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [from, to, vehicle, page]);

  // analysis over the selected range (all pages) + a 6-month trend
  const stats = useQuery(async () => {
    let q = supabase.from('fuel_records').select('vehicle_id,litres,total_cost,odometer_km,fuel_date, vehicles(name)').gte('fuel_date', from).lte('fuel_date', to);
    if (vehicle !== 'all') q = q.eq('vehicle_id', vehicle);
    const rows = unwrap(await q) as unknown as { vehicle_id: string; litres: number; total_cost: number; odometer_km: number | null; vehicles: { name: string } | null }[];
    const byV: Record<string, { name: string; fills: number; litres: number; cost: number; odo: { km: number; litres: number; cost: number }[] }> = {};
    rows.forEach(r => {
      const x = (byV[r.vehicle_id] ??= { name: r.vehicles?.name ?? '—', fills: 0, litres: 0, cost: 0, odo: [] });
      x.fills++; x.litres += Number(r.litres); x.cost += Number(r.total_cost);
      if (r.odometer_km !== null) x.odo.push({ km: Number(r.odometer_km), litres: Number(r.litres), cost: Number(r.total_cost) });
    });
    const per = Object.values(byV).map(x => {
      const o = x.odo.sort((a, b) => a.km - b.km);
      // fuel bought at the first reading was burnt BEFORE it, so it is excluded from the km window
      const dist = o.length >= 2 ? o[o.length - 1].km - o[0].km : 0;
      const win = o.slice(1);
      return { ...x, dist, costPerKm: dist > 0 ? win.reduce((a, b) => a + b.cost, 0) / dist : null, kmPerL: dist > 0 ? dist / win.reduce((a, b) => a + b.litres, 0) : null };
    }).sort((a, b) => b.cost - a.cost);
    const since = format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd');
    let tq = supabase.from('fuel_records').select('fuel_date,total_cost').gte('fuel_date', since);
    if (vehicle !== 'all') tq = tq.eq('vehicle_id', vehicle);
    const trend = unwrap(await tq) as { fuel_date: string; total_cost: number }[];
    const months: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) months[format(subMonths(new Date(), i), 'yyyy-MM')] = 0;
    trend.forEach(t => { const k = t.fuel_date.slice(0, 7); if (k in months) months[k] += Number(t.total_cost); });
    return { per, total: per.reduce((a, b) => a + b.cost, 0), litres: per.reduce((a, b) => a + b.litres, 0), months: Object.entries(months) };
  }, { per: [] as { name: string; fills: number; litres: number; cost: number; dist: number; costPerKm: number | null; kmPerL: number | null }[], total: 0, litres: 0, months: [] as [string, number][] }, [from, to, vehicle]);

  const reload = () => { list.reload(); stats.reload(); };
  const doDelete = async () => {
    if (!del) return;
    try { check(await supabase.from('fuel_records').delete().eq('id', del.id)); if (del.receipt_path) await removePrivate(del.receipt_path); toast.success('Fuel record and its linked expense deleted'); setDel(null); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };
  const maxMonth = Math.max(1, ...stats.data.months.map(x => x[1]));

  return (
    <div>
      <AdminHeader title="Fuel Management" subtitle="Each purchase creates one linked expense automatically" actions={<Button onClick={() => setEditing('new')} disabled={vehicles.data.length === 0}><Plus size={18} /> Record fuel</Button>} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="From"><Input type="date" value={from} max={to} onChange={e => { setFrom(e.target.value); setPage(0); }} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={e => { setTo(e.target.value); setPage(0); }} /></Field>
        <Field label="Vehicle" className="w-48"><Select value={vehicle} onChange={e => { setVehicle(e.target.value); setPage(0); }}><option value="all">All vehicles</option>{vehicles.data.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard label="Fuel spend" value={m(stats.data.total)} icon={<Fuel size={20} />} tone="peach" />
        <StatCard label="Litres bought" value={stats.data.litres.toLocaleString(undefined, { maximumFractionDigits: 1 })} tone="lavender" />
        <StatCard label="Avg price / litre" value={stats.data.litres ? m(stats.data.total / stats.data.litres) : '—'} tone="sunshine" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 mb-6">
        <Card title="Per vehicle" className="lg:col-span-3">
          {stats.data.per.length === 0 ? <p className="text-sm text-ink-500">No fuel purchases in this period.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs font-extrabold uppercase text-ink-400"><th className="py-1 pr-3">Vehicle</th><th className="pr-3">Fills</th><th className="pr-3">Cost</th><th className="pr-3">Cost / km</th><th>km / L</th></tr></thead>
              <tbody>{stats.data.per.map(x => <tr key={x.name} className="border-t border-ink-100"><td className="py-2 pr-3 font-bold">{x.name}</td><td className="pr-3">{x.fills}</td><td className="pr-3">{m(x.cost)}</td>
                <td className="pr-3">{x.costPerKm !== null ? m(x.costPerKm) : <span className="text-ink-300" title="Needs at least two odometer readings">n/a</span>}</td><td>{x.kmPerL !== null ? x.kmPerL.toFixed(1) : <span className="text-ink-300">n/a</span>}</td></tr>)}</tbody></table></div>)}
        </Card>
        <Card title="Last 6 months" className="lg:col-span-2">
          <div className="flex items-end gap-2 h-32">{stats.data.months.map(([k, v]) => (
            <div key={k} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${k}: ${m(v)}`}><div className="w-full rounded-t-lg bg-peach-300" style={{ height: `${(v / maxMonth) * 100}%`, minHeight: v ? 4 : 1 }} /><span className="text-[10px] font-bold text-ink-400">{format(new Date(k + '-01T00:00:00'), 'MMM')}</span></div>))}</div>
        </Card>
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No fuel purchases" message="Record a fuel purchase to start tracking spend and consumption." actionLabel="Record fuel" onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['Date', 'Vehicle', 'Fuel', 'Litres', 'Cost', 'Odometer', 'Station', '']}>
            {list.data.rows.map(r => (
              <tr key={r.id} className="hover:bg-ink-50"><Td>{r.fuel_date}</Td><Td className="font-bold">{r.vehicles?.name}</Td><Td className="capitalize">{r.fuel_type}</Td><Td>{Number(r.litres)}</Td><Td className="font-bold">{m(Number(r.total_cost))}</Td>
                <Td>{r.odometer_km ?? '—'}</Td><Td>{r.fuel_station ?? '—'}</Td>
                <Td className="whitespace-nowrap text-right">
                  {r.receipt_path && <button title="View receipt" onClick={() => openPrivate(r.receipt_path!).catch(er => toast.error(er.message))} className="p-2 rounded-full hover:bg-ink-100"><Paperclip size={16} /></button>}
                  <button title="Edit" onClick={() => setEditing(r)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  <button title="Delete" onClick={() => setDel(r)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><Trash2 size={16} /></button></Td></tr>))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Record fuel purchase' : 'Edit fuel record'}>
        {editing && <FuelForm rec={editing === 'new' ? null : editing} vehicles={vehicles.data} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete fuel record?" confirmLabel="Delete" message="The linked fuel expense is removed with it, so your totals stay consistent. The deletion is kept in the audit log." onClose={() => setDel(null)} onConfirm={doDelete} />
    </div>
  );
};

export default AdminFuel;
