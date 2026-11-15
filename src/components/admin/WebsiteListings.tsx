import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, Bus, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import { supabase, type PublicVehicleListing } from '../../lib/supabase';
import { check, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useToast } from '../../contexts/ToastContext';
import { FormActions } from './crud';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback';
import { Field, Input, Select, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';

type Row = PublicVehicleListing & { sort_order: number; vehicles: { name: string; seating_capacity: number; vehicle_type: string } | null };
const IMG = ['image/jpeg', 'image/png', 'image/webp'];

const schema = z.object({
  vehicle_id: z.string().min(1, 'Choose a vehicle'), title: z.string().trim().min(2, 'Required').max(100),
  description: z.string().trim().max(600), specs: z.string().trim().max(300), hire_info: z.string().trim().max(200), is_published: z.boolean(),
});
type V = z.infer<typeof schema>;
const s0 = (v: string) => (v.trim() === '' ? null : v.trim());

const ListingForm: React.FC<{ row: Row | null; free: { id: string; name: string }[]; nextOrder: number; onDone: () => void; onCancel: () => void }> = ({ row, free, nextOrder, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [removeImg, setRemoveImg] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { vehicle_id: row?.vehicle_id ?? '', title: row?.title ?? '', description: row?.description ?? '', specs: row?.specs ?? '', hire_info: row?.hire_info ?? '', is_published: row?.is_published ?? true },
  });
  const pick = (f: File | null) => {
    if (f && (!IMG.includes(f.type) || f.size > 5 * 1024 * 1024)) { toast.error('Use a JPG, PNG or WebP photo under 5 MB'); return; }
    setFile(f);
  };
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      let image_url = removeImg ? null : row?.image_url ?? null;
      if (file) {
        const path = `listings/${crypto.randomUUID()}.${file.type.split('/')[1]}`;
        const up = await supabase.storage.from('public-assets').upload(path, file, { contentType: file.type });
        if (up.error) throw new Error(up.error.message);
        image_url = supabase.storage.from('public-assets').getPublicUrl(path).data.publicUrl;
      }
      const fields = { title: v.title, description: s0(v.description), specs: s0(v.specs), hire_info: s0(v.hire_info), is_published: v.is_published, image_url };
      check(row ? await supabase.from('public_vehicle_listings').update(fields).eq('id', row.id) : await supabase.from('public_vehicle_listings').insert({ ...fields, vehicle_id: v.vehicle_id, sort_order: nextOrder }));
      toast.success(row ? 'Listing updated' : 'Vehicle added to the website'); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Vehicle *" error={errors.vehicle_id?.message}>
        {row ? <Input value={row.vehicles?.name ?? ''} disabled readOnly /> : <Select {...register('vehicle_id')}><option value="">Select…</option>{free.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>}
      </Field>
      <Field label="Title shown to visitors *" error={errors.title?.message}><Input {...register('title')} placeholder="e.g. Comfort Coach (40 seats)" /></Field>
      <Field label="Description" className="sm:col-span-2"><Textarea rows={2} maxLength={600} {...register('description')} /></Field>
      <Field label="Basic specifications"><Input {...register('specs')} placeholder="A/C, reclining seats, music system" /></Field>
      <Field label="Hire availability info"><Input {...register('hire_info')} placeholder="Available for tours and weddings" /></Field>
      <div className="sm:col-span-2">
        <p className="mb-1.5 text-sm font-bold text-ink-700">Photo</p>
        <div className="flex items-center gap-4">
          <div className="h-20 w-28 rounded-2xl bg-ink-100 overflow-hidden flex items-center justify-center">
            {file ? <img src={URL.createObjectURL(file)} alt="" className="h-full w-full object-cover" /> : row?.image_url && !removeImg ? <img src={row.image_url} alt="" className="h-full w-full object-cover" /> : <Bus className="text-ink-300" />}
          </div>
          <div className="space-y-1"><input type="file" accept={IMG.join(',')} onChange={e => pick(e.target.files?.[0] ?? null)} className="text-sm" />
            {row?.image_url && !file && <label className="flex items-center gap-2 text-xs font-bold text-ink-500"><input type="checkbox" checked={removeImg} onChange={e => setRemoveImg(e.target.checked)} /> Remove current photo</label>}
            <p className="text-xs text-ink-400">This photo is public. Registration numbers and private details are never shown.</p></div>
        </div>
      </div>
      <label className="flex items-center gap-3 font-bold text-ink-700 sm:col-span-2"><input type="checkbox" className="h-5 w-5 accent-teal-500" {...register('is_published')} /> Show on the website</label>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={row ? 'Save changes' : 'Add to website'} /></div>
    </form>
  );
};

const WebsiteListings: React.FC = () => {
  const toast = useToast();
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const data = useQuery(async () => {
    const [l, v] = await Promise.all([
      supabase.from('public_vehicle_listings').select('*, vehicles(name,seating_capacity,vehicle_type)').order('sort_order'),
      supabase.from('vehicles').select('id,name').eq('is_archived', false).neq('status', 'inactive').order('name'),
    ]);
    return { rows: unwrap(l) as unknown as Row[], vehicles: unwrap(v) as { id: string; name: string }[] };
  }, { rows: [] as Row[], vehicles: [] as { id: string; name: string }[] });
  const free = data.data.vehicles.filter(v => !data.data.rows.some(r => r.vehicle_id === v.id));

  const move = async (i: number, dir: -1 | 1) => {
    if (!data.data.rows[i + dir]) return;
    try {
      const order = data.data.rows.map(x => x.id); [order[i], order[i + dir]] = [order[i + dir], order[i]];
      for (let k = 0; k < order.length; k++) check(await supabase.from('public_vehicle_listings').update({ sort_order: k + 1 }).eq('id', order[k]));
      data.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not reorder'); }
  };
  const toggle = async (r: Row) => {
    try { check(await supabase.from('public_vehicle_listings').update({ is_published: !r.is_published }).eq('id', r.id)); data.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3"><p className="text-sm text-ink-500">Choose which vehicles visitors see and how they are described. Only the title, seats, fuel type, text and photo are public.</p>
        <Button onClick={() => setEditing('new')} disabled={free.length === 0}><Plus size={16} /> Add vehicle</Button></div>
      {data.loading ? <Skeleton className="h-48" /> : data.error ? <ErrorState message={data.error} onRetry={data.reload} />
        : data.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState icon={<Bus size={36} strokeWidth={1.5} />} title="No vehicles on the website" message={data.data.vehicles.length ? 'Add a vehicle so visitors can see your fleet.' : 'Add a vehicle in Vehicles first, then list it here.'} actionLabel={free.length ? 'Add vehicle' : undefined} onAction={() => setEditing('new')} /></div>
        : <ul className="space-y-2">{data.data.rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 rounded-3xl border border-ink-100 bg-white p-3 pr-4 shadow-soft">
            <span className="h-14 w-20 rounded-2xl bg-ink-100 overflow-hidden flex items-center justify-center shrink-0">{r.image_url ? <img src={r.image_url} alt="" className="h-full w-full object-cover" /> : <Bus className="text-ink-300" />}</span>
            <span className="min-w-0 flex-1"><span className="block font-bold text-ink-900 truncate">{r.title}</span><span className="block text-xs text-ink-500 truncate">{r.vehicles?.name} · {r.vehicles?.seating_capacity} seats</span></span>
            <Badge color={r.is_published ? 'green' : 'ink'}>{r.is_published ? 'Visible' : 'Hidden'}</Badge>
            <span className="flex items-center">
              <button title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-2 rounded-full hover:bg-ink-100 disabled:opacity-30"><ArrowUp size={16} /></button>
              <button title="Move down" disabled={i === data.data.rows.length - 1} onClick={() => move(i, 1)} className="p-2 rounded-full hover:bg-ink-100 disabled:opacity-30"><ArrowDown size={16} /></button>
              <button title={r.is_published ? 'Hide from website' : 'Show on website'} onClick={() => toggle(r)} className="p-2 rounded-full hover:bg-ink-100">{r.is_published ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              <button title="Edit" onClick={() => setEditing(r)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
            </span>
          </li>))}</ul>}
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add vehicle to the website' : 'Edit website listing'}>
        {editing && <ListingForm row={editing === 'new' ? null : editing} free={free} nextOrder={data.data.rows.length + 1} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); data.reload(); }} />}
      </Modal>
    </div>
  );
};

export default WebsiteListings;
