import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import { supabase, type Payment } from '../../lib/supabase';
import { sanitizeSearch } from '../../lib/db';
import { downloadReceipt } from '../../lib/receipt';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { SearchBox } from '../../components/admin/crud';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Input';

const PAGE = 15;
type Row = Payment & { students: { full_name: string } | null; invoices: { invoice_number: string; billing_month: string; balance: number } | null; hire_bookings: { reference: string; hire_type: string; customers: { full_name: string } | null } | null };
const LABEL: Record<string, string> = { school_transport: 'School transport', bus_hire: 'Bus hire', van_hire: 'Van hire', tuk_tuk_hire: 'Tuk Tuk hire', other: 'Other' };

const AdminPayments: React.FC = () => {
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [category, setCategory] = useState('all');
  const [method, setMethod] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const list = useQuery(async () => {
    let q = supabase.from('payments').select('*, students(full_name), invoices(invoice_number,billing_month,balance), hire_bookings(reference,hire_type,customers(full_name))', { count: 'exact' })
      .gte('payment_date', from).lte('payment_date', to).order('payment_date', { ascending: false }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (category !== 'all') q = q.eq('category', category);
    if (method !== 'all') q = q.eq('method', method);
    const t = sanitizeSearch(search);
    if (t) q = q.ilike('reference', `%${t}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [from, to, category, method, search, page]);

  const totals = useQuery(async () => {
    let q = supabase.from('payments').select('amount').gte('payment_date', from).lte('payment_date', to);
    if (category !== 'all') q = q.eq('category', category);
    if (method !== 'all') q = q.eq('method', method);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((a, r) => a + Number((r as { amount: number }).amount), 0);
  }, 0, [from, to, category, method]);

  const who = (p: Row) => p.hire_bookings?.customers?.full_name ?? p.students?.full_name ?? '—';
  const forText = (p: Row) => p.invoices ? `School transport — ${format(new Date(p.invoices.billing_month + 'T00:00:00'), 'MMM yyyy')} (${p.invoices.invoice_number})` : p.hire_bookings ? `${p.hire_bookings.hire_type.replace(/_/g, ' ')} — ${p.hire_bookings.reference}` : 'Advance payment — school transport';

  return (
    <div>
      <AdminHeader title="Payment Management" subtitle="Every payment received, with receipts. Record payments from Billing or a Booking." />
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="From"><Input type="date" value={from} max={to} onChange={e => { setFrom(e.target.value); setPage(0); }} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={e => { setTo(e.target.value); setPage(0); }} /></Field>
        <Field label="Category" className="w-44"><Select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }}><option value="all">All</option>{Object.entries(LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Method" className="w-40"><Select value={method} onChange={e => { setMethod(e.target.value); setPage(0); }}><option value="all">All</option><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></Select></Field>
        <div className="flex-1 min-w-[180px] pb-0.5"><SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Receipt number" /></div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-5"><StatCard label="Cash collected (filtered)" value={m(totals.data)} tone="mint" hint={`${list.data.total} payment(s)`} /></div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No payments in this period" message="Payments appear here once recorded against an invoice or booking." /></div>
        : <>
          <Table head={['Receipt', 'Date', 'From', 'For', 'Category', 'Method', 'Amount', '']}>
            {list.data.rows.map(p => (
              <tr key={p.id} className="hover:bg-ink-50"><Td className="font-bold">{p.reference}</Td><Td>{p.payment_date}</Td><Td>{who(p)}</Td><Td className="max-w-[240px] truncate" >{forText(p)}</Td>
                <Td><Badge color="mint">{LABEL[p.category] ?? p.category}</Badge></Td><Td>{p.method.replace('_', ' ')}</Td><Td className="font-bold">{m(Number(p.amount))}</Td>
                <Td><button title="Download receipt" onClick={() => downloadReceipt({ reference: p.reference, date: p.payment_date, amount: Number(p.amount), method: p.method, receivedFrom: who(p), forText: forText(p), notes: p.notes }, settings)} className="p-2 rounded-full hover:bg-ink-100"><Download size={16} /></button></Td></tr>))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
    </div>
  );
};

export default AdminPayments;
