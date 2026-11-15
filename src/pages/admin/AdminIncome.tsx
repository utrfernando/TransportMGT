import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { Plus } from 'lucide-react';
import { supabase, type Payment } from '../../lib/supabase';
import { friendlyError, sanitizeSearch, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { SearchBox } from '../../components/admin/crud';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 15;
const LABEL: Record<string, string> = { school_transport: 'School transport payments', bus_hire: 'Bus hire income', van_hire: 'Van hire income', tuk_tuk_hire: 'Tuk Tuk hire income', other: 'Other income' };
type Row = Payment & { students: { full_name: string } | null; invoices: { invoice_number: string } | null; hire_bookings: { reference: string; customers: { full_name: string } | null } | null; vehicles: { name: string } | null };

const schema = z.object({
  amount: z.string().refine(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0, 'Enter an amount above zero'),
  payment_date: z.string().min(1, 'Required'), category: z.enum(['bus_hire', 'van_hire', 'tuk_tuk_hire', 'other']),
  method: z.enum(['cash', 'bank_transfer', 'card', 'other']), vehicle_id: z.string(), notes: z.string().trim().min(3, 'Describe what this income is for').max(300),
});
type V = z.infer<typeof schema>;

const OtherIncomeModal: React.FC<{ open: boolean; vehicles: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }> = ({ open, vehicles, onClose, onSaved }) => {
  const toast = useToast();
  const key = React.useMemo(() => crypto.randomUUID(), [open]);
  const busy = React.useRef(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<V>({ resolver: zodResolver(schema), defaultValues: { amount: '', payment_date: format(new Date(), 'yyyy-MM-dd'), category: 'other', method: 'cash', vehicle_id: '', notes: '' } });
  const onSubmit = async (v: V) => {
    if (busy.current) return; busy.current = true;
    try {
      const { error } = await supabase.from('payments').insert({ reference: '', amount: Number(v.amount), payment_date: v.payment_date, category: v.category, method: v.method, vehicle_id: v.vehicle_id || null, notes: v.notes.trim(), idempotency_key: key });
      if (error) { if (error.code === '23505' && error.message.includes('idempotency')) { onSaved(); onClose(); return; } toast.error(friendlyError(error)); return; }
      toast.success('Income recorded'); reset(); onSaved(); onClose();
    } finally { busy.current = false; }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record other income">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <p className="text-sm text-ink-500">For income not tied to a student invoice or a hire booking. Student fees and hire payments are recorded from Billing and Bookings so they are never counted twice.</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount *" error={errors.amount?.message}><Input inputMode="decimal" {...register('amount')} /></Field>
          <Field label="Date *" error={errors.payment_date?.message}><Input type="date" max={format(new Date(), 'yyyy-MM-dd')} {...register('payment_date')} /></Field>
          <Field label="Category"><Select {...register('category')}><option value="other">Other income</option><option value="bus_hire">Bus hire income</option><option value="van_hire">Van hire income</option><option value="tuk_tuk_hire">Tuk Tuk hire income</option></Select></Field>
          <Field label="Payment method"><Select {...register('method')}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></Select></Field>
        </div>
        <Field label="Related vehicle"><Select {...register('vehicle_id')}><option value="">None</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label="Description *" error={errors.notes?.message}><Textarea rows={2} {...register('notes')} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={isSubmitting}>Record income</Button></div>
      </form>
    </Modal>
  );
};

const AdminIncome: React.FC = () => {
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [category, setCategory] = useState('all');
  const [vehicle, setVehicle] = useState('all');
  const [method, setMethod] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);

  const vehicles = useQuery(async () => unwrap(await supabase.from('vehicles').select('id,name').order('name')) as { id: string; name: string }[], []);

  const filt = <T,>(q: T): T => {
    let x = q as unknown as { eq: (c: string, v: string) => unknown; ilike: (c: string, v: string) => unknown };
    if (category !== 'all') x = x.eq('category', category) as typeof x;
    if (vehicle !== 'all') x = x.eq('vehicle_id', vehicle) as typeof x;
    if (method !== 'all') x = x.eq('method', method) as typeof x;
    const t = sanitizeSearch(search);
    if (t) x = x.ilike('reference', `%${t}%`) as typeof x;
    return x as unknown as T;
  };

  const list = useQuery(async () => {
    const { data, count, error } = await filt(supabase.from('payments').select('*, students(full_name), invoices(invoice_number), hire_bookings(reference, customers(full_name)), vehicles(name)', { count: 'exact' })
      .gte('payment_date', from).lte('payment_date', to).order('payment_date', { ascending: false }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1));
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [from, to, category, vehicle, method, search, page]);

  const totals = useQuery(async () => {
    const { data, error } = await filt(supabase.from('payments').select('amount,category').gte('payment_date', from).lte('payment_date', to));
    if (error) throw new Error(error.message);
    const by: Record<string, number> = {}; let total = 0;
    (data as { amount: number; category: string }[]).forEach(r => { by[r.category] = (by[r.category] ?? 0) + Number(r.amount); total += Number(r.amount); });
    return { total, by: Object.entries(by).sort((a, b) => b[1] - a[1]) };
  }, { total: 0, by: [] as [string, number][] }, [from, to, category, vehicle, method, search]);

  const source = (p: Row) => p.invoices ? <Link className="hover:text-mint-600" to="/admin/billing">{p.invoices.invoice_number} · {p.students?.full_name}</Link>
    : p.hire_bookings ? <Link className="hover:text-mint-600" to={`/admin/bookings`}>{p.hire_bookings.reference} · {p.hire_bookings.customers?.full_name}</Link>
    : p.students ? <span>Advance · {p.students.full_name}</span> : <span className="text-ink-500">{p.notes ?? 'Manual entry'}</span>;

  return (
    <div>
      <AdminHeader title="Income Management" subtitle="Cash actually received. Unpaid invoices and bookings are never counted here." actions={<Button onClick={() => setAdding(true)}><Plus size={18} /> Other income</Button>} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="From"><Input type="date" value={from} max={to} onChange={e => { setFrom(e.target.value); setPage(0); }} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={e => { setTo(e.target.value); setPage(0); }} /></Field>
        <Field label="Category" className="w-52"><Select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">All</option>{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Vehicle" className="w-44"><Select value={vehicle} onChange={e => { setVehicle(e.target.value); setPage(0); }}><option value="all">All</option>{vehicles.data.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label="Method" className="w-40"><Select value={method} onChange={e => { setMethod(e.target.value); setPage(0); }}><option value="all">All</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></Select></Field>
        <div className="flex-1 min-w-[160px] pb-0.5"><SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Receipt no." /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <StatCard label="Total income (filtered)" value={m(totals.data.total)} tone="mint" hint={`${list.data.total} transaction(s)`} />
        <Card title="By category" className="lg:col-span-2">
          {totals.data.by.length === 0 ? <p className="text-sm text-ink-500">No income in this selection.</p> :
            <ul className="space-y-2">{totals.data.by.map(([k, amt]) => (
              <li key={k} className="text-sm"><div className="flex justify-between font-semibold"><span>{LABEL[k] ?? k}</span><span>{m(amt)}</span></div>
                <div className="h-2 rounded-full bg-ink-100 mt-1"><div className="h-2 rounded-full bg-mint-400" style={{ width: `${(amt / totals.data.total) * 100}%` }} /></div></li>))}</ul>}
        </Card>
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No income found" message="Payments appear here as soon as they are recorded." /></div>
        : <>
          <Table head={['Reference', 'Date', 'Category', 'Source', 'Vehicle', 'Method', 'Amount']}>
            {list.data.rows.map(p => (
              <tr key={p.id} className="hover:bg-ink-50"><Td className="font-bold">{p.reference}</Td><Td>{p.payment_date}</Td><Td><Badge color="mint">{LABEL[p.category] ?? p.category}</Badge></Td>
                <Td className="max-w-[260px] truncate">{source(p)}</Td><Td>{p.vehicles?.name ?? '—'}</Td><Td>{p.method.replace('_', ' ')}</Td><Td className="font-bold">{m(Number(p.amount))}</Td></tr>))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
      <OtherIncomeModal open={adding} vehicles={vehicles.data} onClose={() => setAdding(false)} onSaved={() => { list.reload(); totals.reload(); }} />
    </div>
  );
};

export default AdminIncome;
