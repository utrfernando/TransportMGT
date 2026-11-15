import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { FilePlus2, Paperclip, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase, type VehicleDocument } from '../../lib/supabase';
import { check, daysUntil, unwrap } from '../../lib/db';
import { openPrivate, removePrivate, uploadPrivate } from '../../lib/files';
import { useQuery } from '../../lib/queries';
import { useToast } from '../../contexts/ToastContext';
import { AdminHeader, Card, Pager, Table, Td } from '../../components/admin/ui';
import { ExpiryDate, FormActions } from '../../components/admin/crud';
import FileField from '../../components/admin/FileField';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 12;
const TYPES: [string, string][] = [['insurance', 'Insurance'], ['revenue_licence', 'Revenue licence'], ['emission_certificate', 'Emission certificate'], ['registration', 'Registration document'], ['service_invoice', 'Service invoice'], ['agreement', 'Agreement'], ['other', 'Other']];
const typeLabel = (t: string) => TYPES.find(x => x[0] === t)?.[1] ?? t;
type Row = VehicleDocument & { vehicles: { name: string } | null };
type Opt = { id: string; name: string };

const statusOf = (d: VehicleDocument, warn: number): 'valid' | 'due_soon' | 'expired' | 'renewed' => {
  if (d.renewal_status === 'renewed') return 'renewed';
  const left = daysUntil(d.expiry_date);
  if (left === null) return 'valid';
  return left < 0 ? 'expired' : left <= warn ? 'due_soon' : 'valid';
};
const TONE = { valid: 'green', due_soon: 'sunshine', expired: 'red', renewed: 'ink' } as const;

const schema = z.object({
  vehicle_id: z.string().min(1, 'Choose a vehicle'), doc_type: z.enum(['insurance', 'revenue_licence', 'emission_certificate', 'registration', 'service_invoice', 'agreement', 'other']),
  title: z.string().trim().min(2, 'Required').max(150), issue_date: z.string(), expiry_date: z.string(), notes: z.string().max(500),
}).refine(v => !v.issue_date || !v.expiry_date || v.expiry_date >= v.issue_date, { path: ['expiry_date'], message: 'Expiry is before the issue date' });
type V = z.infer<typeof schema>;
const s0 = (v: string) => (v.trim() === '' ? null : v.trim());

const DocForm: React.FC<{ doc: Row | null; renewOf: Row | null; vehicles: Opt[]; onDone: () => void; onCancel: () => void }> = ({ doc, renewOf, vehicles, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const base = doc ?? renewOf;
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { vehicle_id: base?.vehicle_id ?? '', doc_type: base?.doc_type ?? 'insurance', title: base?.title ?? '', issue_date: doc?.issue_date ?? (renewOf ? format(new Date(), 'yyyy-MM-dd') : ''), expiry_date: doc?.expiry_date ?? '', notes: doc?.notes ?? '' },
  });
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      let path = removed ? null : doc?.file_path ?? null;
      if (file) path = await uploadPrivate(file, `documents/${v.vehicle_id}`);
      const row = { vehicle_id: v.vehicle_id, doc_type: v.doc_type, title: v.title, issue_date: s0(v.issue_date), expiry_date: s0(v.expiry_date), notes: s0(v.notes), file_path: path, renewal_status: 'valid' as const };
      if (doc) check(await supabase.from('vehicle_documents').update({ ...row, renewal_status: doc.renewal_status }).eq('id', doc.id));
      else {
        check(await supabase.from('vehicle_documents').insert(row));
        if (renewOf) check(await supabase.from('vehicle_documents').update({ renewal_status: 'renewed' }).eq('id', renewOf.id));
      }
      if (doc?.file_path && doc.file_path !== path) await removePrivate(doc.file_path);
      toast.success(doc ? 'Document updated' : renewOf ? 'Renewed — the old document is marked renewed' : 'Document saved'); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Vehicle *" error={errors.vehicle_id?.message}><Select {...register('vehicle_id')} disabled={!!renewOf}><option value="">Select…</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
      <Field label="Document type"><Select {...register('doc_type')}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Title *" className="sm:col-span-2" error={errors.title?.message}><Input {...register('title')} placeholder="e.g. Comprehensive policy 2026" /></Field>
      <Field label="Issue date"><Input type="date" {...register('issue_date')} /></Field>
      <Field label="Expiry date" error={errors.expiry_date?.message}><Input type="date" {...register('expiry_date')} /></Field>
      <div className="sm:col-span-2"><FileField label="File" existingPath={doc?.file_path ?? null} file={file} removed={removed} onFile={setFile} onRemoveExisting={() => setRemoved(true)} /></div>
      <Field label="Notes" className="sm:col-span-2"><Textarea rows={2} {...register('notes')} /></Field>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={doc ? 'Save changes' : renewOf ? 'Save renewal' : 'Save document'} /></div>
    </form>
  );
};

type Renewal = { key: string; what: string; who: string; date: string; left: number };

const AdminDocuments: React.FC = () => {
  const toast = useToast();
  const [vehicle, setVehicle] = useState('all');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [renewing, setRenewing] = useState<Row | null>(null);
  const [del, setDel] = useState<Row | null>(null);

  const meta = useQuery(async () => {
    const [v, p] = await Promise.all([supabase.from('vehicles').select('id,name').eq('is_archived', false).order('name'), supabase.from('business_settings').select('notification_prefs').eq('id', 1).single()]);
    return { vehicles: unwrap(v) as Opt[], warn: (p.data as { notification_prefs: { document_expiry_days: number } } | null)?.notification_prefs?.document_expiry_days ?? 30 };
  }, { vehicles: [] as Opt[], warn: 30 });
  const warn = meta.data.warn;

  const list = useQuery(async () => {
    let q = supabase.from('vehicle_documents').select('*, vehicles(name)').order('expiry_date', { ascending: true, nullsFirst: false });
    if (vehicle !== 'all') q = q.eq('vehicle_id', vehicle);
    if (type !== 'all') q = q.eq('doc_type', type);
    const rows = unwrap(await q) as unknown as Row[];
    return status === 'all' ? rows : rows.filter(r => statusOf(r, warn) === status);
  }, [] as Row[], [vehicle, type, status, warn]);

  // renewals due: vehicle expiry fields (even without an uploaded document) + driver licences
  const renewals = useQuery(async () => {
    const [v, d] = await Promise.all([
      supabase.from('vehicles').select('name,insurance_expiry,revenue_licence_expiry,emission_expiry').eq('is_archived', false),
      supabase.from('drivers').select('full_name,licence_expiry').eq('is_archived', false).eq('status', 'active'),
    ]);
    const out: Renewal[] = [];
    const add = (key: string, what: string, who: string, date: string | null) => { const left = daysUntil(date); if (date && left !== null && left <= warn) out.push({ key, what, who, date, left }); };
    (unwrap(v) as { name: string; insurance_expiry: string | null; revenue_licence_expiry: string | null; emission_expiry: string | null }[]).forEach(x => {
      add(x.name + 'i', 'Insurance', x.name, x.insurance_expiry); add(x.name + 'r', 'Revenue licence', x.name, x.revenue_licence_expiry); add(x.name + 'e', 'Emission test', x.name, x.emission_expiry);
    });
    (unwrap(d) as { full_name: string; licence_expiry: string | null }[]).forEach(x => add(x.full_name + 'l', 'Driving licence', x.full_name, x.licence_expiry));
    return out.sort((a, b) => a.left - b.left);
  }, [] as Renewal[], [warn]);

  const reload = () => { list.reload(); renewals.reload(); };
  const doDelete = async () => {
    if (!del) return;
    try { check(await supabase.from('vehicle_documents').delete().eq('id', del.id)); if (del.file_path) await removePrivate(del.file_path); toast.success('Document deleted'); setDel(null); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };
  const shown = list.data.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <div>
      <AdminHeader title="Documents & Renewals" subtitle={`Alerts appear ${warn} days before expiry (change in Business Settings)`} actions={<Button onClick={() => setEditing('new')} disabled={meta.data.vehicles.length === 0}><Plus size={18} /> Add document</Button>} />

      <Card title="Renewals due" className="mb-6">
        {renewals.loading ? <Skeleton className="h-16" /> : renewals.data.length === 0 ? <p className="text-sm text-ink-500">Nothing is expiring within {warn} days.</p> :
          <ul className="divide-y divide-ink-100 text-sm">{renewals.data.map(r => (
            <li key={r.key} className="py-2 flex items-center justify-between gap-2"><span className="font-bold">{r.who} <span className="font-semibold text-ink-500">· {r.what}</span></span>
              <span className="flex items-center gap-3"><ExpiryDate date={r.date} warnDays={warn} /><Badge color={r.left < 0 ? 'red' : 'sunshine'}>{r.left < 0 ? `Expired ${-r.left}d ago` : `${r.left}d left`}</Badge></span></li>))}</ul>}
      </Card>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Vehicle" className="w-48"><Select value={vehicle} onChange={e => { setVehicle(e.target.value); setPage(0); }}><option value="all">All vehicles</option>{meta.data.vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        <Field label="Type" className="w-52"><Select value={type} onChange={e => { setType(e.target.value); setPage(0); }}><option value="all">All</option>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Status" className="w-44"><Select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All</option><option value="valid">Valid</option><option value="due_soon">Due soon</option><option value="expired">Expired</option><option value="renewed">Renewed</option></Select></Field>
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState icon={<FilePlus2 size={36} strokeWidth={1.5} />} title="No documents" message="Upload insurance, licences, certificates and agreements to keep them in one safe place." actionLabel="Add document" onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['Vehicle', 'Type', 'Title', 'Issued', 'Expires', 'Status', '']}>
            {shown.map(r => { const st = statusOf(r, warn); return (
              <tr key={r.id} className="hover:bg-ink-50"><Td className="font-bold">{r.vehicles?.name}</Td><Td>{typeLabel(r.doc_type)}</Td><Td className="max-w-[220px] truncate">{r.title}</Td><Td>{r.issue_date ?? '—'}</Td>
                <Td><ExpiryDate date={r.expiry_date} warnDays={warn} /></Td><Td><Badge color={TONE[st]}>{st.replace('_', ' ')}</Badge></Td>
                <Td className="whitespace-nowrap text-right">
                  {r.file_path && <button title="Open file" onClick={() => openPrivate(r.file_path!).catch(er => toast.error(er.message))} className="p-2 rounded-full hover:bg-ink-100"><Paperclip size={16} /></button>}
                  {st !== 'renewed' && r.expiry_date && <button title="Renew" onClick={() => setRenewing(r)} className="p-2 rounded-full hover:bg-ink-100 text-mint-600"><RefreshCw size={16} /></button>}
                  <button title="Edit" onClick={() => setEditing(r)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  <button title="Delete" onClick={() => setDel(r)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><Trash2 size={16} /></button></Td></tr>); })}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.length} onPage={setPage} />
        </>}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add document' : 'Edit document'}>
        {editing && <DocForm doc={editing === 'new' ? null : editing} renewOf={null} vehicles={meta.data.vehicles} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
      </Modal>
      <Modal open={!!renewing} onClose={() => setRenewing(null)} wide title={`Renew ${renewing ? typeLabel(renewing.doc_type) : ''}`}>
        {renewing && <DocForm doc={null} renewOf={renewing} vehicles={meta.data.vehicles} onCancel={() => setRenewing(null)} onDone={() => { setRenewing(null); reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Delete document?" confirmLabel="Delete" message={`${del?.title} and its stored file will be permanently removed.`} onClose={() => setDel(null)} onConfirm={doDelete} />
    </div>
  );
};

export default AdminDocuments;
