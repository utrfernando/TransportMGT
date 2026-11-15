import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { MessageCircle, Phone, Search } from 'lucide-react';
import { supabase, type Inquiry, type InquiryStatus } from '../../lib/supabase';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { whatsappLink } from '../../lib/utils';
import { friendlyError, unwrap } from '../../lib/db';
import { localInputToIso } from '../../lib/time';
import { AdminHeader, Pager, Table, Td } from '../../components/admin/ui';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Input, Select, Textarea, Field } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 15;
const STATUSES: { v: InquiryStatus; label: string }[] = [
  { v: 'new', label: 'New' }, { v: 'contacted', label: 'Contacted' }, { v: 'quotation_sent', label: 'Quotation sent' },
  { v: 'converted', label: 'Converted to booking' }, { v: 'closed', label: 'Closed' },
];
const tone = (s: InquiryStatus) => ({ new: 'sunshine', contacted: 'mint', quotation_sent: 'lavender', converted: 'green', closed: 'ink' } as const)[s];

const ConvertModal: React.FC<{ inquiry: Inquiry | null; onClose: () => void; onDone: () => void }> = ({ inquiry, onClose, onDone }) => {
  const toast = useToast();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [price, setPrice] = useState('');
  const [arr, setArr] = useState('owner_drives');
  const [driver, setDriver] = useState('');
  const [busy, setBusy] = useState(false);
  const opts = useQuery(async () => {
    const [v, d] = await Promise.all([
      supabase.from('vehicles').select('id,name,seating_capacity').eq('is_archived', false).eq('status', 'active').order('name'),
      supabase.from('drivers').select('id,full_name,is_owner').eq('is_archived', false).eq('status', 'active').order('full_name'),
    ]);
    return { vehicles: unwrap(v) as { id: string; name: string; seating_capacity: number }[], drivers: unwrap(d) as { id: string; full_name: string; is_owner: boolean }[] };
  }, { vehicles: [] as { id: string; name: string; seating_capacity: number }[], drivers: [] as { id: string; full_name: string; is_owner: boolean }[] });
  const valid = vehicle && start && end && end > start && (arr !== 'external_driver' || driver);
  const submit = async () => {
    if (!inquiry) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('convert_inquiry_to_booking', {
      p_inquiry: inquiry.id, p_vehicle: vehicle, p_start: localInputToIso(start), p_end: localInputToIso(end), p_price: Number(price || 0),
      p_arrangement: arr, p_driver: arr === 'vehicle_only' ? null : (driver || null),
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success('Customer and booking created from the inquiry');
    onDone(); navigate(`/admin/bookings?open=${data as string}`);
  };
  return (
    <Modal open={!!inquiry} onClose={onClose} title={`Convert ${inquiry?.reference ?? ''} to booking`}>
      <div className="space-y-4">
        <p className="text-sm text-ink-600">The customer ({inquiry?.customer_name}) is created — or matched by phone number — and the trip details are copied over. The booking starts as an “inquiry”; confirm it once availability is checked.</p>
        <Field label="Vehicle *"><Select value={vehicle} onChange={e => setVehicle(e.target.value)}><option value="">Select…</option>{opts.data.vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.seating_capacity} seats)</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start (Sri Lanka time) *"><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
          <Field label="End *"><Input type="datetime-local" value={end} min={start} onChange={e => setEnd(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Agreed price"><Input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></Field>
          <Field label="Driver arrangement"><Select value={arr} onChange={e => { setArr(e.target.value); setDriver(''); }}><option value="owner_drives">Owner drives</option><option value="external_driver">External driver</option><option value="vehicle_only">Vehicle only</option></Select></Field>
        </div>
        {arr === 'external_driver' && <Field label="Driver *"><Select value={driver} onChange={e => setDriver(e.target.value)}><option value="">Select…</option>{opts.data.drivers.filter(d => !d.is_owner).map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</Select></Field>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!valid} onClick={submit}>Create booking</Button></div>
      </div>
    </Modal>
  );
};

const AdminInquiries: React.FC = () => {
  const toast = useToast();
  const { settings } = useSettings();
  const [status, setStatus] = useState<'all' | InquiryStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Inquiry | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<Inquiry | null>(null);

  const list = useQuery(async () => {
    let q = supabase.from('public_inquiries').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (status !== 'all') q = q.eq('status', status);
    const s = search.trim().replace(/[%,()]/g, '');
    if (s) q = q.or(`customer_name.ilike.%${s}%,phone.ilike.%${s}%,reference.ilike.%${s}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Inquiry[], total: count ?? 0 };
  }, { rows: [] as Inquiry[], total: 0 }, [status, search, page]);

  const save = async (patch: Partial<Inquiry>) => {
    if (!open) return;
    setSaving(true);
    const { error } = await supabase.from('public_inquiries').update(patch).eq('id', open.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Inquiry updated');
    setOpen({ ...open, ...patch });
    list.reload();
  };

  const wa = open ? whatsappLink(open.phone, `Hello ${open.customer_name}, this is ${settings.business_name} regarding your inquiry ${open.reference}.`) : null;

  return (
    <div>
      <AdminHeader title="Inquiry Management" subtitle="Requests submitted through the public website" />
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input className="pl-10" placeholder="Search name, phone or reference" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select className="w-52" value={status} onChange={e => { setStatus(e.target.value as 'all' | InquiryStatus); setPage(0); }}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
        </Select>
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No inquiries found" message="New website inquiries will appear here." /></div>
        : <>
          <Table head={['Reference', 'Customer', 'Service', 'Travel date', 'Received', 'Status']}>
            {list.data.rows.map(i => (
              <tr key={i.id} className="hover:bg-ink-50 cursor-pointer" onClick={() => { setOpen(i); setNotes(i.admin_notes ?? ''); }}>
                <Td className="font-bold">{i.reference}</Td>
                <Td>{i.customer_name}<br /><span className="text-xs text-ink-400">{i.phone}</span></Td>
                <Td>{i.service}</Td>
                <Td>{i.travel_date ? format(new Date(i.travel_date), 'dd MMM yyyy') : '—'}</Td>
                <Td>{format(new Date(i.created_at), 'dd MMM, HH:mm')}</Td>
                <Td><Badge color={tone(i.status)}>{i.status.replace('_', ' ')}</Badge></Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Inquiry ${open.reference}` : ''} wide>
        {open && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {([
                ['Customer', open.customer_name], ['Phone', open.phone], ['Email', open.email], ['Service', open.service],
                ['Preferred vehicle', open.preferred_vehicle], ['Driver requirement', open.driver_requirement?.replace('_', ' ')],
                ['Pickup', open.pickup_location], ['Destination', open.destination],
                ['Travel date', open.travel_date], ['Passengers', open.passenger_count],
              ] as [string, string | number | null | undefined][]).map(([k, v]) => (
                <div key={k}><p className="text-xs font-extrabold uppercase text-ink-400">{k}</p><p className="font-semibold text-ink-900">{v ?? '—'}</p></div>
              ))}
            </div>
            {open.message && <div><p className="text-xs font-extrabold uppercase text-ink-400">Message</p><p className="text-ink-700 whitespace-pre-line">{open.message}</p></div>}
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${open.phone}`}><Button variant="outline" size="sm"><Phone size={14} /> Call</Button></a>
              {wa && <a href={wa} target="_blank" rel="noreferrer"><Button variant="outline" size="sm"><MessageCircle size={14} /> WhatsApp</Button></a>}
            </div>
            <Field label="Status">
              <Select value={open.status} disabled={saving} onChange={e => save({ status: e.target.value as InquiryStatus })}>
                {STATUSES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Internal notes">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} />
            </Field>
            <div className="flex justify-end"><Button loading={saving} onClick={() => save({ admin_notes: notes })}>Save notes</Button></div>
            {open.status !== 'converted'
              ? <div className="flex justify-end"><Button variant="sunshine" onClick={() => setConverting(open)}>Convert to booking</Button></div>
              : <p className="text-xs font-semibold text-mint-700">This inquiry has been converted to a booking.</p>}
          </div>
        )}
      </Modal>
      <ConvertModal inquiry={converting} onClose={() => setConverting(null)} onDone={() => { setConverting(null); setOpen(null); list.reload(); }} />
    </div>
  );
};

export default AdminInquiries;
