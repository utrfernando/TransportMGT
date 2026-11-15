import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Archive, ArchiveRestore, Eye, Pencil, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { supabase, type Customer } from '../../lib/supabase';
import { check, sanitizeSearch, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { FormActions, KV, SearchBox, StatusBadge } from '../../components/admin/crud';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 12;
const schema = z.object({
  full_name: z.string().trim().min(2, 'Required').max(120),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid phone number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  address: z.string().max(300), category: z.enum(['individual', 'school', 'corporate', 'other']), notes: z.string().max(1000),
});
type V = z.infer<typeof schema>;
const s = (v: string) => (v.trim() === '' ? null : v.trim());

const CustomerForm: React.FC<{ customer: Customer | null; onDone: () => void; onCancel: () => void }> = ({ customer, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: customer?.full_name ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '', address: customer?.address ?? '', category: customer?.category ?? 'individual', notes: customer?.notes ?? '' },
  });
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      const row = { full_name: v.full_name, phone: v.phone, email: s(v.email), address: s(v.address), category: v.category, notes: s(v.notes) };
      check(customer ? await supabase.from('customers').update(row).eq('id', customer.id) : await supabase.from('customers').insert(row));
      toast.success(customer ? 'Customer updated' : 'Customer added');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save customer'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Customer name *" error={errors.full_name?.message}><Input {...register('full_name')} /></Field>
      <Field label="Contact number *" error={errors.phone?.message}><Input type="tel" {...register('phone')} /></Field>
      <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
      <Field label="Category"><Select {...register('category')}><option value="individual">Individual</option><option value="school">School</option><option value="corporate">Corporate</option><option value="other">Other</option></Select></Field>
      <Field label="Address" className="sm:col-span-2"><Input {...register('address')} /></Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={customer ? 'Save changes' : 'Add customer'} /></div>
    </form>
  );
};

type Booking = { id: string; reference: string; start_at: string; status: string; agreed_price: number };
const CustomerDetail: React.FC<{ customer: Customer }> = ({ customer }) => {
  const { settings } = useSettings();
  const cur = settings.currency;
  const q = useQuery(async () => {
    const bookings = unwrap(await supabase.from('hire_bookings').select('id,reference,start_at,status,agreed_price').eq('customer_id', customer.id).neq('status', 'cancelled').order('start_at', { ascending: false })) as Booking[];
    const ids = bookings.map(b => b.id);
    const paid = ids.length ? (unwrap(await supabase.from('payments').select('amount').in('booking_id', ids)) as { amount: number }[]).reduce((a, p) => a + Number(p.amount), 0) : 0;
    return { bookings, paid };
  }, { bookings: [] as Booking[], paid: 0 }, [customer.id]);
  const total = q.data.bookings.reduce((a, b) => a + Number(b.agreed_price), 0);
  return (
    <div className="space-y-5">
      <KV items={[['Phone', customer.phone], ['Email', customer.email], ['Category', customer.category], ['Address', customer.address], ['Notes', customer.notes]]} />
      {q.loading ? <Skeleton className="h-24" /> : <>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total hire value" value={formatMoney(total, cur)} tone="mint" />
          <StatCard label="Paid" value={formatMoney(q.data.paid, cur)} tone="lavender" />
          <StatCard label="Outstanding" value={formatMoney(total - q.data.paid, cur)} tone={total - q.data.paid > 0 ? 'sunshine' : 'ink'} />
        </div>
        <h4 className="font-display font-bold">Booking history</h4>
        {q.data.bookings.length === 0 ? <p className="text-sm text-ink-500">No bookings yet.</p> :
          <ul className="divide-y divide-ink-100 text-sm">{q.data.bookings.map(b => <li key={b.id} className="py-2 flex justify-between gap-2"><span className="font-bold">{b.reference}</span><span>{format(new Date(b.start_at), 'dd MMM yyyy')}</span><span>{formatMoney(b.agreed_price, cur)}</span><StatusBadge status={b.status} /></li>)}</ul>}
      </>}
    </div>
  );
};

const AdminCustomers: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [toArchive, setToArchive] = useState<Customer | null>(null);

  const list = useQuery(async () => {
    let q = supabase.from('customers').select('*', { count: 'exact' }).eq('is_archived', archived).order('full_name').range(page * PAGE, page * PAGE + PAGE - 1);
    if (category !== 'all') q = q.eq('category', category);
    const t = sanitizeSearch(search);
    if (t) q = q.or(`full_name.ilike.%${t}%,phone.ilike.%${t}%,email.ilike.%${t}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Customer[], total: count ?? 0 };
  }, { rows: [] as Customer[], total: 0 }, [search, category, archived, page]);

  const setFlag = async (c: Customer, flag: boolean) => {
    try { check(await supabase.from('customers').update({ is_archived: flag }).eq('id', c.id)); toast.success(flag ? 'Customer archived' : 'Customer restored'); setToArchive(null); list.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <AdminHeader title="Customer Management" subtitle="One record per customer, shared by all bookings" actions={<Button onClick={() => setEditing('new')}><Plus size={18} /> Add customer</Button>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search name, phone or email" />
        <Select className="w-44" value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">All categories</option><option value="individual">Individual</option><option value="school">School</option><option value="corporate">Corporate</option><option value="other">Other</option></Select>
        <label className="flex items-center gap-2 text-sm font-bold text-ink-600"><input type="checkbox" className="h-4 w-4 accent-teal-500" checked={archived} onChange={e => { setArchived(e.target.checked); setPage(0); }} /> Archived</label>
      </div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No customers yet" message="Customers are created here or automatically when you convert an inquiry." actionLabel={archived ? undefined : 'Add customer'} onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['Customer', 'Phone', 'Email', 'Category', '']}>
            {list.data.rows.map(c => (
              <tr key={c.id} className="hover:bg-ink-50">
                <Td className="font-bold">{c.full_name}</Td><Td>{c.phone}</Td><Td>{c.email ?? '—'}</Td><Td><Badge color="mint">{c.category}</Badge></Td>
                <Td className="whitespace-nowrap text-right">
                  <button title="View" onClick={() => setViewing(c)} className="p-2 rounded-full hover:bg-ink-100"><Eye size={16} /></button>
                  <button title="Edit" onClick={() => setEditing(c)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  {archived ? <button title="Restore" onClick={() => setFlag(c, false)} className="p-2 rounded-full hover:bg-ink-100"><ArchiveRestore size={16} /></button>
                    : <button title="Archive" onClick={() => setToArchive(c)} className="p-2 rounded-full hover:bg-ink-100"><Archive size={16} /></button>}
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add customer' : 'Edit customer'}>
        {editing && <CustomerForm customer={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <Modal open={!!viewing} onClose={() => setViewing(null)} wide title={viewing?.full_name}>{viewing && <CustomerDetail customer={viewing} />}</Modal>
      <ConfirmDialog open={!!toArchive} title="Archive customer?" confirmLabel="Archive" message={`${toArchive?.full_name} will be hidden from lists. Bookings and payments are kept.`} onClose={() => setToArchive(null)} onConfirm={() => toArchive && setFlag(toArchive, true)} />
    </div>
  );
};

export default AdminCustomers;
