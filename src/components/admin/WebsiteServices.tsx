import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, type Service } from '../../lib/supabase';
import { check, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useToast } from '../../contexts/ToastContext';
import { ServiceIcon } from '../public/bits';
import { FormActions } from './crud';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback';
import { Field, Input, Select, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';

const ICONS: [string, string][] = [['graduation-cap', 'School / graduation cap'], ['bus', 'Bus'], ['car-front', 'Van / car'], ['bike', 'Tuk tuk / bike'], ['map-pinned', 'Map pin'], ['user-round-check', 'Driver'], ['key-round', 'Key'], ['truck', 'Truck']];
const slugify = (t: string) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const schema = z.object({
  title: z.string().trim().min(2, 'Required').max(80),
  slug: z.string().trim().max(60).regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Use lowercase letters, numbers and dashes only'),
  summary: z.string().trim().min(5, 'Write a short summary').max(200),
  description: z.string().trim().max(1000),
  icon: z.string(), is_published: z.boolean(),
});
type V = z.infer<typeof schema>;

const ServiceForm: React.FC<{ service: Service | null; nextOrder: number; onDone: () => void; onCancel: () => void }> = ({ service, nextOrder, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: { title: service?.title ?? '', slug: service?.slug ?? '', summary: service?.summary ?? '', description: service?.description ?? '', icon: service?.icon ?? 'bus', is_published: service?.is_published ?? true },
  });
  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      const row = { title: v.title, slug: v.slug || slugify(v.title), summary: v.summary, description: v.description || null, icon: v.icon, is_published: v.is_published };
      if (!row.slug) throw new Error('Could not make a web address name from that title');
      check(service ? await supabase.from('services').update(row).eq('id', service.id) : await supabase.from('services').insert({ ...row, sort_order: nextOrder }));
      toast.success(service ? 'Service updated' : 'Service added'); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid sm:grid-cols-2 gap-4">
      <Field label="Service name *" error={errors.title?.message}><Input {...register('title')} /></Field>
      <Field label="Icon"><Select {...register('icon')}>{ICONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
      <Field label="Short summary * (shown on cards)" className="sm:col-span-2" error={errors.summary?.message}><Textarea rows={2} maxLength={200} {...register('summary')} /></Field>
      <Field label="Full description (shown on the Services page)" className="sm:col-span-2" error={errors.description?.message}><Textarea rows={4} maxLength={1000} {...register('description')} /></Field>
      <Field label="Web address name" hint="Optional. Leave blank to make it from the name, e.g. bus-hire." error={errors.slug?.message}><Input {...register('slug')} /></Field>
      <label className="flex items-center gap-3 font-bold text-ink-700 sm:pt-7"><input type="checkbox" className="h-5 w-5 accent-teal-500" {...register('is_published')} /> Show on the website</label>
      <div className="sm:col-span-2"><FormActions onCancel={onCancel} saving={saving} label={service ? 'Save changes' : 'Add service'} /></div>
    </form>
  );
};

const WebsiteServices: React.FC = () => {
  const toast = useToast();
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [del, setDel] = useState<Service | null>(null);
  const list = useQuery(async () => unwrap(await supabase.from('services').select('*').order('sort_order')) as Service[], [] as Service[]);

  const move = async (i: number, dir: -1 | 1) => {
    const a = list.data[i], b = list.data[i + dir]; if (!a || !b) return;
    try {
      // swap positions; sort_order values may be equal, so renumber the whole list to be safe
      const order = list.data.map(x => x.id); [order[i], order[i + dir]] = [order[i + dir], order[i]];
      for (let k = 0; k < order.length; k++) check(await supabase.from('services').update({ sort_order: k + 1 }).eq('id', order[k]));
      list.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not reorder'); }
  };
  const toggle = async (s: Service) => {
    try { check(await supabase.from('services').update({ is_published: !s.is_published }).eq('id', s.id)); list.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };
  const doDelete = async () => {
    if (!del) return;
    try { check(await supabase.from('services').delete().eq('id', del.id)); toast.success('Service removed from the website'); setDel(null); list.reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4"><p className="text-sm text-ink-500">These appear on the Home and Services pages and in the inquiry form’s “Service required” list.</p>
        <Button onClick={() => setEditing('new')}><Plus size={16} /> Add service</Button></div>
      {list.loading ? <Skeleton className="h-48" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No services yet" message="Add the services you offer. Visitors see only the ones marked “Show on the website”." actionLabel="Add service" onAction={() => setEditing('new')} /></div>
        : <ul className="space-y-2">{list.data.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 rounded-3xl border border-ink-100 bg-white p-3 pr-4 shadow-soft">
            <span className="w-11 h-11 rounded-2xl bg-mint-100 text-mint-600 flex items-center justify-center shrink-0"><ServiceIcon name={s.icon} size={22} /></span>
            <span className="min-w-0 flex-1"><span className="block font-bold text-ink-900 truncate">{s.title}</span><span className="block text-xs text-ink-500 truncate">{s.summary}</span></span>
            <Badge color={s.is_published ? 'green' : 'ink'}>{s.is_published ? 'Visible' : 'Hidden'}</Badge>
            <span className="flex items-center">
              <button title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="p-2 rounded-full hover:bg-ink-100 disabled:opacity-30"><ArrowUp size={16} /></button>
              <button title="Move down" disabled={i === list.data.length - 1} onClick={() => move(i, 1)} className="p-2 rounded-full hover:bg-ink-100 disabled:opacity-30"><ArrowDown size={16} /></button>
              <button title={s.is_published ? 'Hide from website' : 'Show on website'} onClick={() => toggle(s)} className="p-2 rounded-full hover:bg-ink-100">{s.is_published ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              <button title="Edit" onClick={() => setEditing(s)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
              <button title="Delete" onClick={() => setDel(s)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><Trash2 size={16} /></button>
            </span>
          </li>))}</ul>}
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add service' : 'Edit service'}>
        {editing && <ServiceForm service={editing === 'new' ? null : editing} nextOrder={list.data.length + 1} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Remove service?" confirmLabel="Remove" message={`“${del?.title}” will disappear from the website. Past inquiries that mention it are not affected. To keep it for later, hide it instead.`} onClose={() => setDel(null)} onConfirm={doDelete} />
    </div>
  );
};

export default WebsiteServices;
