import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { Lock, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, type Expense, type ExpenseCategory } from '../../lib/supabase';
import { check, sanitizeSearch, unwrap } from '../../lib/db';
import { openPrivate, removePrivate, uploadPrivate } from '../../lib/files';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { FormActions, SearchBox } from '../../components/admin/crud';
import FileField from '../../components/admin/FileField';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 15;
type Row = Expense & { expense_categories: { name: string } | null; vehicles: { name: string } | null };
type Opt = { id: string; name: string };

const schema = z.object({
  expense_date: z.string().min(1, 'Required'), category_id: z.string().min(1, 'Choose a category'),
  description: z.string().trim().min(2, 'Required').max(200),
  amount: z.string().refine(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0, 'Enter an amount above zero'),
  vehicle_id: z.string(), payment_method: z.enum(['cash', 'bank_transfer', 'card', 'other']), supplier: z.string().max(120), notes: z.string().max(1000),
});
type V = z.infer<typeof schema>;
const s0 = (v: string) => (v.trim() === '' ? null : v.trim());

const ExpenseForm: React.FC<{ expense: Row | null; categories: ExpenseCategory[]; vehicles: Opt[]; onDone: () => void; onCancel: () => void }> = ({ expense, categories, vehicles, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      expense_date: expense?.expense_date ?? format(new Date(), 'yyyy-MM-dd'), category_id: expense?.category_id ?? '', description: expense?.description ?? '',
      amount: expense?.amount?.toString() ?? '', vehicle_id: expense?.vehicle_id ?? '', payment_method: expense?.payment_method ?? 'cash', supplier: expense?.supplier ?? '', notes: expense?.notes ?? '',
    },
  });
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      let receipt = removed ? null : expense?.receipt_path ?? null;
      if (file) receipt = await uploadPrivate(file, 'receipts/expenses');
      const row = { expense_date: v.expense_date, category_id: v.category_id, description: v.description, amount: Number(v.amount), vehicle_id: s0(v.vehicle_id), payment_method: v.payment_method, supplier: s0(v.supplier), notes: s0(v.notes), receipt_path: receipt };
      check(expense ? await supabase.from('expenses').update(row).eq('id', expense.id) : await supabase.from('expenses').insert(row));
      if (expense?.receipt_path && expense.receipt_path !== receipt) await removePrivate(expense.receipt_path);
      toast.success(expense ? 'Expense updated' : 'Expense recorded'); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save expense'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Date *" error={errors.expense_date?.message}><Input type="date" max={format(new Date(), 'yyyy-MM-dd')} {...register('expense_date')} /></Field>
      <Field label="Category *" error={errors.category_id?.message}><Select {...register('category_id')}><option value="">Select…</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label="Description *" className="sm:col-span-2" error={errors.description?.message}><Input {...register('description')} /></Field>
      <Field label="Amount *" error={errors.amount?.message}><Input inputMode="decimal" {...register('amount')} /></Field>
      <Field label="Payment method"><Select {...register('payment_method')}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></Select></Field>
      <Field label="Related vehicle"><Select {...register('vehicle_id')}><option value="">None (general)</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
      <Field label="Supplier"><Input {...register('supplier')} /></Field>
      <div className="sm:col-span-2"><FileField label="Receipt" existingPath={expense?.receipt_path ?? null} file={file} removed={removed} onFile={setFile} onRemoveExisting={() => setRemoved(true)} /></div>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={expense ? 'Save changes' : 'Record expense'} /></div>
    </form>
  );
};

const SOURCE_LABEL: Record<string, string> = { fuel: 'Fuel module', maintenance: 'Maintenance module', driver_payment: 'Driver payment' };

const AdminExpenses: React.FC = () => {
  const { settings } = useSettings();
  const toast = useToast();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [category, setCategory] = useState('all');
  const [vehicle, setVehicle] = useState('all');
  const [method, setMethod] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [del, setDel] = useState<Row | null>(null);

  const opts = useQuery(async () => {
    const [c, v] = await Promise.all([supabase.from('expense_categories').select('*').order('sort_order'), supabase.from('vehicles').select('id,name').order('name')]);
    return { categories: unwrap(c) as ExpenseCategory[], vehicles: unwrap(v) as Opt[] };
  }, { categories: [] as ExpenseCategory[], vehicles: [] as Opt[] });

  const filt = <T,>(q: T): T => {
    let x = q as unknown as { eq: (c: string, v: string) => unknown; ilike: (c: string, v: string) => unknown };
    if (category !== 'all') x = x.eq('category_id', category) as typeof x;
    if (vehicle !== 'all') x = x.eq('vehicle_id', vehicle) as typeof x;
    if (method !== 'all') x = x.eq('payment_method', method) as typeof x;
    const t = sanitizeSearch(search);
    if (t) x = x.ilike('description', `%${t}%`) as typeof x;
    return x as unknown as T;
  };

  const list = useQuery(async () => {
    const q = filt(supabase.from('expenses').select('*, expense_categories(name), vehicles(name)', { count: 'exact' }).gte('expense_date', from).lte('expense_date', to)
      .order('expense_date', { ascending: false }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1));
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [from, to, category, vehicle, method, search, page]);

  const totals = useQuery(async () => {
    const { data, error } = await filt(supabase.from('expenses').select('amount, expense_categories(name)').gte('expense_date', from).lte('expense_date', to));
    if (error) throw new Error(error.message);
    const by: Record<string, number> = {}; let total = 0;
    (data as unknown as { amount: number; expense_categories: { name: string } | null }[]).forEach(r => { const k = r.expense_categories?.name ?? 'Other'; by[k] = (by[k] ?? 0) + Number(r.amount); total += Number(r.amount); });
    return { total, by: Object.entries(by).sort((a, b) => b[1] - a[1]) };
  }, { total: 0, by: [] as [string, number][] }, [from, to, category, vehicle, method, search]);

  const reload = () => { list.reload(); totals.reload(); };
  const doDelete = async () => {
    if (!del) return;
    try { check(await supabase.from('expenses').delete().eq('id', del.id)); if (del.receipt_path) await removePrivate(del.receipt_path); toast.success('Expense deleted (kept in the audit log)'); setDel(null); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <AdminHeader title="Expense Management" subtitle="Everything the business spends, with receipts" actions={<Button onClick={() => setEditing('new')}><Plus size={18} /> Add expense</Button>} />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="From"><Input type="date" value={from} max={to} onChange={e => { setFrom(e.target.value); setPage(0); }} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={e => { setTo(e.target.value); setPage(0); }} /></Field>
        <Field label="Category" className="w-44"><Select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">All</option>{opts.data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Vehicle" className="w-44"><Select value={vehicle} onChange={e => { setVehicle(e.target.value); setPage(0); }}><option value="all">All</option>{opts.data.vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label="Method" className="w-40"><Select value={method} onChange={e => { setMethod(e.target.value); setPage(0); }}><option value="all">All</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></Select></Field>
        <div className="flex-1 min-w-[180px] pb-0.5"><SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search description" /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-6">
        <StatCard label="Total expenses (filtered)" value={m(totals.data.total)} tone="peach" hint={`${list.data.total} record(s)`} />
        <Card title="By category" className="lg:col-span-2">
          {totals.data.by.length === 0 ? <p className="text-sm text-ink-500">No expenses in this selection.</p> :
            <ul className="space-y-2">{totals.data.by.slice(0, 6).map(([name, amt]) => (
              <li key={name} className="text-sm"><div className="flex justify-between font-semibold"><span>{name}</span><span>{m(amt)}</span></div>
                <div className="h-2 rounded-full bg-ink-100 mt-1"><div className="h-2 rounded-full bg-peach-400" style={{ width: `${(amt / totals.data.total) * 100}%` }} /></div></li>))}</ul>}
        </Card>
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No expenses found" message="Record an expense, or adjust the filters." actionLabel="Add expense" onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['Ref', 'Date', 'Category', 'Description', 'Vehicle', 'Amount', '']}>
            {list.data.rows.map(e => (
              <tr key={e.id} className="hover:bg-ink-50">
                <Td className="font-bold">{e.reference}</Td><Td>{e.expense_date}</Td><Td><Badge color="peach">{e.expense_categories?.name}</Badge></Td>
                <Td className="max-w-[260px]"><span className="block truncate">{e.description}</span>{e.supplier && <span className="text-xs text-ink-400">{e.supplier}</span>}
                  {e.source !== 'manual' && <span className="ml-0 inline-flex items-center gap-1 text-[11px] font-bold text-lavender-600"><Lock size={11} /> {SOURCE_LABEL[e.source]}</span>}</Td>
                <Td>{e.vehicles?.name ?? '—'}</Td><Td className="font-bold">{m(Number(e.amount))}</Td>
                <Td className="whitespace-nowrap text-right">
                  {e.receipt_path && <button title="View receipt" onClick={() => openPrivate(e.receipt_path!).catch(er => toast.error(er.message))} className="p-2 rounded-full hover:bg-ink-100"><Paperclip size={16} /></button>}
                  {e.source === 'manual' ? <>
                    <button title="Edit" onClick={() => setEditing(e)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                    <button title="Delete" onClick={() => setDel(e)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><Trash2 size={16} /></button></>
                    : <span title="Edit this from its source module" className="inline-flex p-2 text-ink-300"><Lock size={16} /></span>}
                </Td>
              </tr>))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add expense' : 'Edit expense'}>
        {editing && <ExpenseForm expense={editing === 'new' ? null : editing} categories={opts.data.categories} vehicles={opts.data.vehicles} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete expense?" confirmLabel="Delete" message={`${del?.reference} (${del ? m(Number(del.amount)) : ''}) will be removed from your reports. The deletion is kept in the audit log.`} onClose={() => setDel(null)} onConfirm={doDelete} />
    </div>
  );
};

export default AdminExpenses;
