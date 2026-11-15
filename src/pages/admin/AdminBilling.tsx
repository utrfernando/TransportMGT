import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Banknote, Download, FilePlus2, Pencil, PiggyBank, Receipt, Wallet, XCircle } from 'lucide-react';
import { supabase, type Invoice, type Payment } from '../../lib/supabase';
import { friendlyError, sanitizeSearch, unwrap } from '../../lib/db';
import { downloadReceipt } from '../../lib/receipt';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { SearchBox, StatusBadge } from '../../components/admin/crud';
import PaymentModal, { type PaymentTarget } from '../../components/admin/PaymentModal';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 15;
type Row = Invoice & { students: { full_name: string; student_code: string } | null; schools: { name: string } | null };
type Credit = Payment & { students: { full_name: string; student_code: string } | null };

const adjSchema = z.object({
  discount: z.string().refine(v => v !== '' && Number(v) >= 0, 'Enter 0 or more'),
  adjustment: z.string().refine(v => v !== '' && !isNaN(Number(v)), 'Enter a number (negative reduces, positive adds)'),
  reason: z.string().trim().min(3, 'A reason is required').max(200),
});
type AdjV = z.infer<typeof adjSchema>;

const AdjustModal: React.FC<{ inv: Row | null; onClose: () => void; onSaved: () => void }> = ({ inv, onClose, onSaved }) => {
  const toast = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AdjV>({
    resolver: zodResolver(adjSchema), values: { discount: String(inv?.discount ?? 0), adjustment: String(inv?.adjustment ?? 0), reason: '' },
  });
  const onSubmit = async (v: AdjV) => {
    if (!inv) return;
    const { error } = await supabase.rpc('adjust_invoice', { p_invoice: inv.id, p_discount: Number(v.discount), p_adjustment: Number(v.adjustment), p_reason: v.reason });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success('Invoice adjusted'); onSaved(); onClose();
  };
  return (
    <Modal open={!!inv} onClose={onClose} title={`Adjust ${inv?.invoice_number ?? ''}`}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <p className="text-sm text-ink-500">Monthly fee {inv && formatMoney(inv.monthly_fee, 'LKR')}. Every adjustment is recorded with your reason in the audit log.</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Discount" error={errors.discount?.message}><Input inputMode="decimal" {...register('discount')} /></Field>
          <Field label="Other adjustment (+/−)" error={errors.adjustment?.message}><Input inputMode="decimal" {...register('adjustment')} /></Field>
        </div>
        <Field label="Reason *" error={errors.reason?.message}><Textarea rows={2} {...register('reason')} /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={isSubmitting}>Save adjustment</Button></div>
      </form>
    </Modal>
  );
};

const InvoiceDetail: React.FC<{ inv: Row }> = ({ inv }) => {
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const q = useQuery(async () => {
    const items = unwrap(await supabase.from('invoice_items').select('id,description,amount').eq('invoice_id', inv.id)) as { id: string; description: string; amount: number }[];
    const pays = unwrap(await supabase.from('payments').select('*').eq('invoice_id', inv.id).order('payment_date')) as Payment[];
    return { items, pays };
  }, { items: [] as { id: string; description: string; amount: number }[], pays: [] as Payment[] }, [inv.id]);
  const who = `${inv.students?.full_name} (${inv.students?.student_code})`;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3"><div><p className="text-xs font-extrabold uppercase text-ink-400">Student</p><p className="font-bold">{who}</p></div>
        <div><p className="text-xs font-extrabold uppercase text-ink-400">School</p><p className="font-bold">{inv.schools?.name}</p></div>
        <div><p className="text-xs font-extrabold uppercase text-ink-400">Due</p><p className="font-bold">{inv.due_date}</p></div>
        <div><p className="text-xs font-extrabold uppercase text-ink-400">Previous outstanding (info)</p><p className="font-bold">{m(Number(inv.previous_balance))}</p></div></div>
      {q.loading ? <Skeleton className="h-24" /> : <>
        <div><p className="font-display font-bold mb-1">Items</p>{q.data.items.map(i => <div key={i.id} className="flex justify-between py-1 border-b border-ink-100"><span>{i.description}</span><span>{m(Number(i.amount))}</span></div>)}
          <div className="flex justify-between py-1 font-bold"><span>Total payable</span><span>{m(Number(inv.total_payable))}</span></div></div>
        <div><p className="font-display font-bold mb-1">Payments</p>
          {q.data.pays.length === 0 ? <p className="text-ink-500">No payments yet.</p> : q.data.pays.map(p => (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-ink-100 gap-2">
              <span><b>{p.reference}</b> <span className="text-ink-400">· {p.payment_date} · {p.method.replace('_', ' ')}</span></span>
              <span className="flex items-center gap-2">{m(Number(p.amount))}
                <button title="Download receipt" onClick={() => downloadReceipt({ reference: p.reference, date: p.payment_date, amount: Number(p.amount), method: p.method, receivedFrom: who, forText: `School transport — ${format(new Date(inv.billing_month + 'T00:00:00'), 'MMM yyyy')} (${inv.invoice_number})`, balanceAfter: Number(inv.balance), notes: p.notes }, settings)} className="p-1.5 rounded-full hover:bg-ink-100"><Download size={15} /></button></span>
            </div>))}
        </div></>}
    </div>
  );
};

const AdminBilling: React.FC = () => {
  const { settings } = useSettings();
  const toast = useToast();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [status, setStatus] = useState('all');
  const [school, setSchool] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [confirmGen, setConfirmGen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const [adjust, setAdjust] = useState<Row | null>(null);
  const [view, setView] = useState<Row | null>(null);
  const [cancel, setCancel] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [advanceFor, setAdvanceFor] = useState('');
  const [applying, setApplying] = useState<Credit | null>(null);
  const [applyTo, setApplyTo] = useState('');

  useEffect(() => { supabase.rpc('mark_overdue_invoices').then(() => undefined); }, []);

  const monthStart = `${month}-01`;
  const schools = useQuery(async () => unwrap(await supabase.from('schools').select('id,name').eq('is_archived', false).order('name')) as { id: string; name: string }[], []);
  const students = useQuery(async () => unwrap(await supabase.from('students').select('id,full_name,student_code').eq('status', 'active').order('full_name')) as { id: string; full_name: string; student_code: string }[], []);

  const summary = useQuery(async () => {
    const rows = unwrap(await supabase.from('invoices').select('total_payable,amount_paid,balance,status').eq('billing_month', monthStart).neq('status', 'cancelled')) as { total_payable: number; amount_paid: number; balance: number; status: string }[];
    return { invoiced: rows.reduce((a, r) => a + Number(r.total_payable), 0), collected: rows.reduce((a, r) => a + Number(r.amount_paid), 0), outstanding: rows.reduce((a, r) => a + Number(r.balance), 0), overdue: rows.filter(r => r.status === 'overdue').length, count: rows.length };
  }, { invoiced: 0, collected: 0, outstanding: 0, overdue: 0, count: 0 }, [monthStart]);

  const list = useQuery(async () => {
    const t = sanitizeSearch(search);
    let q = supabase.from('invoices').select(`*, students${t ? '!inner' : ''}(full_name,student_code), schools(name)`, { count: 'exact' }).eq('billing_month', monthStart).order('invoice_number').range(page * PAGE, page * PAGE + PAGE - 1);
    if (status !== 'all') q = q.eq('status', status);
    if (school !== 'all') q = q.eq('school_id', school);
    if (t) q = q.or(`full_name.ilike.%${t}%,student_code.ilike.%${t}%`, { referencedTable: 'students' });
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as unknown as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [monthStart, status, school, search, page]);

  const credits = useQuery(async () => unwrap(await supabase.from('payments').select('*, students(full_name,student_code)').not('student_id', 'is', null).is('invoice_id', null).is('booking_id', null).order('payment_date', { ascending: false })) as unknown as Credit[], [] as Credit[]);
  const openInv = useQuery(async () => applying ? unwrap(await supabase.from('invoices').select('id,invoice_number,billing_month,balance').eq('student_id', applying.student_id!).gt('balance', 0).neq('status', 'cancelled').order('billing_month')) as { id: string; invoice_number: string; billing_month: string; balance: number }[] : [], [] as { id: string; invoice_number: string; billing_month: string; balance: number }[], [applying?.id]);

  const reload = () => { list.reload(); summary.reload(); credits.reload(); };

  const generate = async () => {
    setGenerating(true);
    const { data, error } = await supabase.rpc('generate_monthly_invoices', { p_month: monthStart });
    setGenerating(false); setConfirmGen(false);
    if (error) { toast.error(friendlyError(error)); return; }
    await supabase.rpc('mark_overdue_invoices');
    const r = (data as { created: number; skipped: number }[])[0];
    toast.success(`${r.created} invoice(s) created, ${r.skipped} already existed`);
    setPage(0); reload();
  };

  const doCancel = async () => {
    if (!cancel) return;
    const { error } = await supabase.rpc('cancel_invoice', { p_invoice: cancel.id, p_reason: cancelReason });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success('Invoice cancelled'); setCancel(null); setCancelReason(''); reload();
  };

  const doApply = async () => {
    if (!applying || !applyTo) return;
    const { error } = await supabase.rpc('apply_advance', { p_payment: applying.id, p_invoice: applyTo });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success('Advance applied to invoice'); setApplying(null); setApplyTo(''); reload();
  };

  const stu = students.data.find(s => s.id === advanceFor);

  return (
    <div>
      <AdminHeader title="Student Billing" subtitle="Monthly invoices, payments and advance credits"
        actions={<><Button variant="outline" onClick={() => setAdvanceFor(students.data[0]?.id ?? '')} disabled={students.data.length === 0}><PiggyBank size={18} /> Record advance</Button><Button onClick={() => setConfirmGen(true)}><FilePlus2 size={18} /> Generate invoices</Button></>} />

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Billing month"><Input type="month" value={month} onChange={e => { if (e.target.value) { setMonth(e.target.value); setPage(0); } }} /></Field>
        <Field label="Status" className="w-44"><Select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All</option><option value="unpaid">Unpaid</option><option value="partially_paid">Partially paid</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="cancelled">Cancelled</option></Select></Field>
        <Field label="School" className="w-48"><Select value={school} onChange={e => { setSchool(e.target.value); setPage(0); }}><option value="all">All schools</option>{schools.data.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <div className="flex-1 min-w-[200px] pb-0.5"><SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search student or ID" /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard label="Invoiced" value={m(summary.data.invoiced)} hint={`${summary.data.count} invoices`} icon={<Receipt size={20} />} tone="lavender" />
        <StatCard label="Cash collected" value={m(summary.data.collected)} icon={<Banknote size={20} />} tone="mint" />
        <StatCard label="Outstanding" value={m(summary.data.outstanding)} icon={<Wallet size={20} />} tone={summary.data.outstanding > 0 ? 'sunshine' : 'ink'} />
        <StatCard label="Overdue invoices" value={String(summary.data.overdue)} icon={<XCircle size={20} />} tone={summary.data.overdue > 0 ? 'red' : 'ink'} />
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No invoices for this month" message="Use “Generate invoices” to bill all active students. It is safe to run more than once — existing invoices are never duplicated." actionLabel="Generate invoices" onAction={() => setConfirmGen(true)} /></div>
        : <>
          <Table head={['Invoice', 'Student', 'School', 'Payable', 'Paid', 'Balance', 'Due', 'Status', '']}>
            {list.data.rows.map(i => (
              <tr key={i.id} className="hover:bg-ink-50">
                <Td><button onClick={() => setView(i)} className="font-bold hover:text-mint-600">{i.invoice_number}</button></Td>
                <Td><Link to={`/admin/students/${i.student_id}`} className="hover:text-mint-600">{i.students?.full_name}</Link></Td><Td>{i.schools?.name}</Td>
                <Td>{m(Number(i.total_payable))}</Td><Td>{m(Number(i.amount_paid))}</Td><Td className="font-bold">{m(Number(i.balance))}</Td><Td>{i.due_date}</Td><Td><StatusBadge status={i.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  {i.status !== 'cancelled' && Number(i.balance) > 0 && <Button size="sm" onClick={() => setPay({ kind: 'invoice', id: i.id, title: 'Record payment', receivedFrom: `${i.students?.full_name} (${i.students?.student_code})`, forText: `School transport — ${format(new Date(i.billing_month + 'T00:00:00'), 'MMM yyyy')} (${i.invoice_number})`, balance: Number(i.balance) })}>Pay</Button>}
                  {i.status !== 'cancelled' && <button title="Adjust" onClick={() => setAdjust(i)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={15} /></button>}
                  {i.status !== 'cancelled' && Number(i.amount_paid) === 0 && <button title="Cancel invoice" onClick={() => setCancel(i)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><XCircle size={15} /></button>}
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}

      {credits.data.length > 0 && (
        <Card title="Advance payments awaiting allocation" className="mt-6">
          <ul className="divide-y divide-ink-100 text-sm">{credits.data.map(c => (
            <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2"><span><b>{c.students?.full_name}</b> · {c.reference} · {c.payment_date}</span>
              <span className="flex items-center gap-2 font-bold">{m(Number(c.amount))}<Button size="sm" variant="outline" onClick={() => { setApplying(c); setApplyTo(''); }}>Apply to invoice</Button></span></li>))}</ul>
        </Card>
      )}

      <ConfirmDialog open={confirmGen} loading={generating} title={`Generate invoices for ${format(new Date(monthStart + 'T00:00:00'), 'MMMM yyyy')}?`} confirmLabel="Generate"
        message="Every active student whose service covers this month gets one invoice. Students who already have an invoice are skipped, and part-month fees follow your billing rule in Business Settings." onClose={() => setConfirmGen(false)} onConfirm={generate} />
      <PaymentModal target={pay} onClose={() => setPay(null)} onSaved={reload} />
      <PaymentModal target={advanceFor ? { kind: 'advance', studentId: advanceFor, title: 'Record advance payment', receivedFrom: stu ? `${stu.full_name} (${stu.student_code})` : '', forText: 'Advance payment — school transport' } : null} onClose={() => setAdvanceFor('')} onSaved={reload} />
      <AdjustModal inv={adjust} onClose={() => setAdjust(null)} onSaved={reload} />
      <Modal open={!!view} onClose={() => setView(null)} wide title={view?.invoice_number}>{view && <InvoiceDetail inv={view} />}</Modal>
      <Modal open={!!cancel} onClose={() => setCancel(null)} title="Cancel invoice">
        <div className="space-y-4"><p className="text-sm text-ink-600">{cancel?.invoice_number} has no payments. Cancelling keeps the record but removes it from receivables.</p>
          <Field label="Reason *"><Input value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCancel(null)}>Keep</Button><Button variant="danger" disabled={cancelReason.trim().length < 3} onClick={doCancel}>Cancel invoice</Button></div></div>
      </Modal>
      <Modal open={!!applying} onClose={() => setApplying(null)} title="Apply advance to an invoice">
        {applying && <div className="space-y-4"><p className="text-sm text-ink-600">{applying.reference} · {m(Number(applying.amount))}. If it exceeds the invoice balance the remainder stays as credit.</p>
          <Field label="Invoice"><Select value={applyTo} onChange={e => setApplyTo(e.target.value)}><option value="">Select…</option>{openInv.data.map(i => <option key={i.id} value={i.id}>{i.invoice_number} — balance {m(Number(i.balance))}</option>)}</Select></Field>
          {!openInv.loading && openInv.data.length === 0 && <p className="text-sm text-ink-500">This student has no open invoices yet.</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setApplying(null)}>Cancel</Button><Button disabled={!applyTo} onClick={doApply}>Apply</Button></div></div>}
      </Modal>
    </div>
  );
};

export default AdminBilling;
