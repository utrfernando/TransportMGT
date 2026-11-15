import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, Pencil, Plus } from 'lucide-react';
import { supabase, type Booking, type BookingStatus, type Customer, type Driver, type DriverAssignment, type Payment } from '../../lib/supabase';
import { friendlyError, sanitizeSearch, unwrap } from '../../lib/db';
import { downloadReceipt } from '../../lib/receipt';
import { fmtDateTime } from '../../lib/time';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, Pager, StatCard, Table, Td } from '../../components/admin/ui';
import { KV, SearchBox, StatusBadge } from '../../components/admin/crud';
import BookingForm from '../../components/admin/BookingForm';
import PaymentModal, { type PaymentTarget } from '../../components/admin/PaymentModal';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 12;
const STATUSES: BookingStatus[] = ['inquiry', 'quotation_sent', 'confirmed', 'in_progress', 'completed', 'cancelled'];
type Row = Booking & { customers: { full_name: string; phone: string } | null; vehicles: { name: string } | null; drivers: { full_name: string } | null };
type VehOpt = { id: string; name: string; vehicle_type: string; seating_capacity: number };

const BookingDetail: React.FC<{ id: string; onChanged: () => void }> = ({ id, onChanged }) => {
  const { settings } = useSettings();
  const toast = useToast();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [pay, setPay] = useState<PaymentTarget | null>(null);
  const [payDriver, setPayDriver] = useState<DriverAssignment | null>(null);
  const [dAmount, setDAmount] = useState('');
  const [dMethod, setDMethod] = useState('cash');
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const b = unwrap(await supabase.from('hire_bookings').select('*, customers(full_name,phone), vehicles(name), drivers:assigned_driver_id(full_name)').eq('id', id).single()) as unknown as Row;
    const pays = unwrap(await supabase.from('payments').select('*').eq('booking_id', id).order('payment_date')) as Payment[];
    const a = (await supabase.from('booking_driver_assignments').select('*').eq('booking_id', id).maybeSingle()).data as DriverAssignment | null;
    return { b, pays, a };
  }, null as { b: Row; pays: Payment[]; a: DriverAssignment | null } | null, [id]);

  const changeStatus = async (status: string) => {
    const { error } = await supabase.from('hire_bookings').update({ status }).eq('id', id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success('Status updated'); q.reload(); onChanged();
  };
  const submitDriver = async () => {
    if (!payDriver) return;
    setBusy(true);
    const { error } = await supabase.rpc('pay_driver', { p_assignment: payDriver.id, p_amount: Number(dAmount), p_method: dMethod });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success('Driver payment recorded'); setPayDriver(null); setDAmount(''); q.reload(); onChanged();
  };

  if (q.loading) return <Skeleton className="h-64" />;
  if (q.error || !q.data) return <ErrorState message={q.error ?? 'Not found'} />;
  const { b, pays, a } = q.data;
  const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Number(b.agreed_price) - paid;
  const driverFee = a ? Number(a.agreed_fee) : 0;
  const profit = Number(b.agreed_price) - Number(b.fuel_cost) - Number(b.other_expenses) - driverFee;
  const cancelled = b.status === 'cancelled';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <StatusBadge status={b.status} />
        <Select className="!w-48" value={b.status} onChange={e => changeStatus(e.target.value)}>{STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
      </div>
      <KV items={[['Customer', `${b.customers?.full_name} · ${b.customers?.phone}`], ['Vehicle', b.vehicles?.name], ['Hire type', b.hire_type.replace(/_/g, ' ')],
        ['Start', fmtDateTime(b.start_at)], ['End', fmtDateTime(b.end_at)], ['Passengers', b.passenger_count], ['Pickup', b.pickup_location], ['Destination', b.destination],
        ['Return', b.return_location], ['Distance', b.distance_km ? `${b.distance_km} km` : null], ['Driver arrangement', b.arrangement.replace(/_/g, ' ')], ['Driver', b.drivers?.full_name], ['Notes', b.notes]]} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Agreed price" value={m(Number(b.agreed_price))} tone="lavender" />
        <StatCard label="Paid" value={m(paid)} tone="mint" hint={Number(b.advance_amount) ? `Advance required ${m(Number(b.advance_amount))}` : undefined} />
        <StatCard label="Balance" value={m(balance)} tone={balance > 0 ? 'sunshine' : 'ink'} />
        <StatCard label="Est. margin" value={m(profit)} tone={profit >= 0 ? 'mint' : 'red'} hint="Price − fuel − other − driver fee" />
      </div>

      <Card title="Customer payments" actions={!cancelled && balance > 0 ? <Button size="sm" onClick={() => setPay({ kind: 'booking', id: b.id, title: 'Record payment', receivedFrom: b.customers?.full_name ?? '', forText: `${b.hire_type.replace(/_/g, ' ')} — ${b.reference}`, balance })}>Record payment</Button> : undefined}>
        {pays.length === 0 ? <p className="text-sm text-ink-500">No payments yet.</p> : pays.map(p => (
          <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-ink-100 text-sm gap-2">
            <span><b>{p.reference}</b> <span className="text-ink-400">· {p.payment_date} · {p.method.replace('_', ' ')}</span></span>
            <span className="flex items-center gap-2">{m(Number(p.amount))}
              <button title="Receipt" onClick={() => downloadReceipt({ reference: p.reference, date: p.payment_date, amount: Number(p.amount), method: p.method, receivedFrom: b.customers?.full_name ?? '', forText: `${b.hire_type.replace(/_/g, ' ')} — ${b.reference}`, balanceAfter: balance, notes: p.notes }, settings)} className="p-1.5 rounded-full hover:bg-ink-100"><Download size={15} /></button></span>
          </div>))}
      </Card>

      {a && (
        <Card title="Driver payment" actions={Number(a.advance_paid) < Number(a.agreed_fee) ? <Button size="sm" variant="outline" onClick={() => { setPayDriver(a); setDAmount(String(Number(a.agreed_fee) - Number(a.advance_paid))); }}>Pay driver</Button> : undefined}>
          <div className="grid grid-cols-3 gap-3 text-sm"><div><p className="text-xs font-extrabold uppercase text-ink-400">Agreed fee</p><p className="font-bold">{m(driverFee)}</p></div>
            <div><p className="text-xs font-extrabold uppercase text-ink-400">Paid</p><p className="font-bold">{m(Number(a.advance_paid))}</p></div>
            <div><p className="text-xs font-extrabold uppercase text-ink-400">Remaining</p><p className="font-bold">{m(driverFee - Number(a.advance_paid))} <StatusBadge status={a.payment_status} /></p></div></div>
        </Card>)}

      <PaymentModal target={pay} onClose={() => setPay(null)} onSaved={() => { q.reload(); onChanged(); }} />
      <Modal open={!!payDriver} onClose={() => setPayDriver(null)} title="Pay driver">
        <div className="space-y-4"><Field label="Amount"><Input inputMode="decimal" value={dAmount} onChange={e => setDAmount(e.target.value)} /></Field>
          <Field label="Method"><Select value={dMethod} onChange={e => setDMethod(e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></Select></Field>
          <p className="text-xs text-ink-500">This is also recorded as a “Driver payments” expense linked to this booking.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPayDriver(null)}>Cancel</Button><Button loading={busy} disabled={!(Number(dAmount) > 0)} onClick={submitDriver}>Record</Button></div></div>
      </Modal>
    </div>
  );
};

const AdminBookings: React.FC = () => {
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [vehicle, setVehicle] = useState('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [params, setParams] = useSearchParams();
  const [viewing, setViewingState] = useState<string | null>(params.get('open'));
  const setViewing = (id: string | null) => { setViewingState(id); if (!id && params.has('open')) { params.delete('open'); setParams(params, { replace: true }); } };

  const opts = useQuery(async () => {
    const [c, v, d] = await Promise.all([
      supabase.from('customers').select('*').eq('is_archived', false).order('full_name'),
      supabase.from('vehicles').select('id,name,vehicle_type,seating_capacity').eq('is_archived', false).eq('status', 'active').order('name'),
      supabase.from('drivers').select('*').eq('is_archived', false).eq('status', 'active').order('full_name'),
    ]);
    return { customers: unwrap(c) as Customer[], vehicles: unwrap(v) as VehOpt[], drivers: unwrap(d) as Driver[] };
  }, { customers: [] as Customer[], vehicles: [] as VehOpt[], drivers: [] as Driver[] });

  const list = useQuery(async () => {
    const t = sanitizeSearch(search);
    let q = supabase.from('hire_bookings').select(`*, customers${t ? '!inner' : ''}(full_name,phone), vehicles(name), drivers:assigned_driver_id(full_name)`, { count: 'exact' }).order('start_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (status !== 'all') q = q.eq('status', status);
    if (vehicle !== 'all') q = q.eq('vehicle_id', vehicle);
    if (t) q = q.or(`full_name.ilike.%${t}%,phone.ilike.%${t}%`, { referencedTable: 'customers' });
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Row[];
    const paid: Record<string, number> = {};
    if (rows.length) {
      const { data: pays } = await supabase.from('payments').select('booking_id,amount').in('booking_id', rows.map(r => r.id));
      (pays ?? []).forEach(p => { const k = (p as { booking_id: string }).booking_id; paid[k] = (paid[k] ?? 0) + Number((p as { amount: number }).amount); });
    }
    return { rows, total: count ?? 0, paid };
  }, { rows: [] as Row[], total: 0, paid: {} as Record<string, number> }, [search, status, vehicle, page]);

  const ready = opts.data.vehicles.length > 0;

  return (
    <div>
      <AdminHeader title="Hire Bookings" subtitle="Bus, van and tuk tuk hires — with availability checks" actions={<Button disabled={!ready} onClick={() => setEditing('new')}><Plus size={18} /> New booking</Button>} />
      {!opts.loading && !ready && <p className="mb-4 rounded-2xl bg-sunshine-50 text-sunshine-700 text-sm font-semibold p-3">Add an active vehicle first (Vehicles page).</p>}
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search customer name or phone" />
        <Select className="w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select>
        <Select className="w-48" value={vehicle} onChange={e => { setVehicle(e.target.value); setPage(0); }}><option value="all">All vehicles</option>{opts.data.vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
      </div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No bookings found" message="Create a booking, or convert a website inquiry into one." /></div>
        : <>
          <Table head={['Reference', 'Customer', 'Vehicle', 'When', 'Status', 'Price', 'Balance', '']}>
            {list.data.rows.map(b => {
              const paid = list.data.paid[b.id] ?? 0;
              return (
                <tr key={b.id} className="hover:bg-ink-50">
                  <Td><button onClick={() => setViewing(b.id)} className="font-bold hover:text-mint-600">{b.reference}</button></Td>
                  <Td>{b.customers?.full_name}<br /><span className="text-xs text-ink-400">{b.destination ? `→ ${b.destination}` : b.customers?.phone}</span></Td>
                  <Td>{b.vehicles?.name}<br /><span className="text-xs text-ink-400">{b.arrangement === 'vehicle_only' ? 'No driver' : b.drivers?.full_name ?? 'Owner'}</span></Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(b.start_at)}</Td><Td><StatusBadge status={b.status} /></Td>
                  <Td>{m(Number(b.agreed_price))}</Td><Td className="font-bold">{b.status === 'cancelled' ? '—' : m(Number(b.agreed_price) - paid)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <button title="View" onClick={() => setViewing(b.id)} className="p-2 rounded-full hover:bg-ink-100"><Eye size={16} /></button>
                    <button title="Edit" onClick={() => setEditing(b)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  </Td>
                </tr>);
            })}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'New booking' : `Edit ${(editing as Row | null)?.reference ?? ''}`}>
        {editing && <BookingForm booking={editing === 'new' ? null : editing} customers={opts.data.customers} vehicles={opts.data.vehicles} drivers={opts.data.drivers} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <Modal open={!!viewing} onClose={() => setViewing(null)} wide title="Booking details">{viewing && <BookingDetail id={viewing} onChanged={list.reload} />}</Modal>
    </div>
  );
};

export default AdminBookings;
