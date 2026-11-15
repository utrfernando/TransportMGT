import React, { useState } from 'react';
import { format } from 'date-fns';
import { MessageCircle, Phone, Search } from 'lucide-react';
import { supabase, type Inquiry, type InquiryStatus } from '../../lib/supabase';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { whatsappLink } from '../../lib/utils';
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

const AdminInquiries: React.FC = () => {
  const toast = useToast();
  const { settings } = useSettings();
  const [status, setStatus] = useState<'all' | InquiryStatus>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Inquiry | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

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
            <p className="text-xs text-ink-400">Converting an inquiry into a customer and booking arrives with the booking module (Phase 3).</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminInquiries;
