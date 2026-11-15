import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { supabase, type PublicVehicleListing, type Vehicle } from '../../lib/supabase';
import { check, signedUrl } from '../../lib/db';
import { useToast } from '../../contexts/ToastContext';
import { Field, Input, Select, Textarea } from '../ui/Input';
import { FormActions } from './crud';

const numStr = (label: string, opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z.string().refine(v => v === '' || (!isNaN(Number(v)) && (opts.min === undefined || Number(v) >= opts.min) && (opts.max === undefined || Number(v) <= opts.max) && (!opts.int || Number.isInteger(Number(v)))), `${label}: enter a valid number`);

const schema = z.object({
  name: z.string().trim().min(2, 'Required').max(80),
  vehicle_type: z.enum(['bus', 'van', 'three_wheeler', 'other']),
  registration_number: z.string().trim().min(3, 'Required').max(20),
  brand: z.string().trim().max(60), model: z.string().trim().max(60),
  manufacturing_year: numStr('Year', { min: 1950, max: 2100, int: true }),
  seating_capacity: z.string().refine(v => Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 100, 'Enter seats (1–100)'),
  fuel_type: z.enum(['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other']),
  fuel_tank_capacity: numStr('Tank', { min: 1 }),
  odometer_km: numStr('Odometer', { min: 0 }),
  ownership_info: z.string().max(300),
  insurance_expiry: z.string(), revenue_licence_expiry: z.string(), emission_expiry: z.string(),
  status: z.enum(['active', 'under_maintenance', 'unavailable', 'inactive']),
  notes: z.string().max(1000),
  listed: z.boolean(),
  l_title: z.string().max(100), l_description: z.string().max(600), l_specs: z.string().max(300), l_hire_info: z.string().max(200),
}).refine(v => !v.listed || v.l_title.trim().length > 1, { path: ['l_title'], message: 'Title required for website listing' });
type V = z.infer<typeof schema>;

const IMG = ['image/jpeg', 'image/png', 'image/webp'];
const checkImg = (f: File) => IMG.includes(f.type) ? f.size <= 5 * 1024 * 1024 ? null : `${f.name} is over 5 MB` : `${f.name}: only JPG, PNG or WebP`;
const ext = (f: File) => f.type.split('/')[1];
const n = (s: string) => (s === '' ? null : Number(s));
const s = (v: string) => (v.trim() === '' ? null : v.trim());

const VehicleForm: React.FC<{ vehicle: Vehicle | null; onDone: () => void; onCancel: () => void }> = ({ vehicle, onDone, onCancel }) => {
  const toast = useToast();
  const [listing, setListing] = useState<PublicVehicleListing | null>(null);
  const [photos, setPhotos] = useState<string[]>(vehicle?.photo_paths ?? []);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [newPhotos, setNewPhotos] = useState<File[]>([]);
  const [listImg, setListImg] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: vehicle?.name ?? '', vehicle_type: vehicle?.vehicle_type ?? 'bus', registration_number: vehicle?.registration_number ?? '',
      brand: vehicle?.brand ?? '', model: vehicle?.model ?? '', manufacturing_year: vehicle?.manufacturing_year?.toString() ?? '',
      seating_capacity: vehicle?.seating_capacity?.toString() ?? '', fuel_type: vehicle?.fuel_type ?? 'diesel',
      fuel_tank_capacity: vehicle?.fuel_tank_capacity?.toString() ?? '', odometer_km: vehicle?.odometer_km?.toString() ?? '0',
      ownership_info: vehicle?.ownership_info ?? '', insurance_expiry: vehicle?.insurance_expiry ?? '',
      revenue_licence_expiry: vehicle?.revenue_licence_expiry ?? '', emission_expiry: vehicle?.emission_expiry ?? '',
      status: vehicle?.status ?? 'active', notes: vehicle?.notes ?? '', listed: false, l_title: '', l_description: '', l_specs: '', l_hire_info: '',
    },
  });
  const listed = watch('listed');

  useEffect(() => {
    if (!vehicle) return;
    supabase.from('public_vehicle_listings').select('*').eq('vehicle_id', vehicle.id).maybeSingle().then(({ data }) => {
      const l = data as PublicVehicleListing | null;
      setListing(l);
      if (l) reset(cur => ({ ...cur, listed: l.is_published, l_title: l.title, l_description: l.description ?? '', l_specs: l.specs ?? '', l_hire_info: l.hire_info ?? '' }));
    });
  }, [vehicle, reset]);

  useEffect(() => {
    photos.forEach(p => { if (!thumbs[p]) signedUrl(p).then(u => u && setThumbs(t => ({ ...t, [p]: u }))); });
  }, [photos, thumbs]);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files);
    const bad = list.map(checkImg).find(Boolean);
    if (bad) { toast.error(bad); return; }
    if (photos.length + newPhotos.length + list.length > 6) { toast.error('Maximum 6 photos per vehicle'); return; }
    setNewPhotos(p => [...p, ...list]);
  };

  const onSubmit = async (v: V) => {
    setSaving(true);
    try {
      const id = vehicle?.id ?? crypto.randomUUID();
      const uploaded: string[] = [];
      for (const f of newPhotos) {
        const path = `vehicles/${id}/${crypto.randomUUID()}.${ext(f)}`;
        const up = await supabase.storage.from('private-files').upload(path, f, { contentType: f.type });
        if (up.error) throw new Error(up.error.message);
        uploaded.push(path);
      }
      const row = {
        name: v.name, vehicle_type: v.vehicle_type, registration_number: v.registration_number.toUpperCase(), brand: s(v.brand), model: s(v.model),
        manufacturing_year: n(v.manufacturing_year), seating_capacity: Number(v.seating_capacity), fuel_type: v.fuel_type,
        fuel_tank_capacity: n(v.fuel_tank_capacity), odometer_km: n(v.odometer_km) ?? 0, ownership_info: s(v.ownership_info),
        photo_paths: [...photos, ...uploaded], insurance_expiry: s(v.insurance_expiry), revenue_licence_expiry: s(v.revenue_licence_expiry),
        emission_expiry: s(v.emission_expiry), status: v.status, notes: s(v.notes),
      };
      check(vehicle ? await supabase.from('vehicles').update(row).eq('id', id) : await supabase.from('vehicles').insert({ id, ...row }));

      // public website listing (only safe fields are ever exposed through the public_vehicles view)
      if (v.listed || listing) {
        let image_url = listing?.image_url ?? null;
        if (listImg) {
          const path = `listings/${crypto.randomUUID()}.${ext(listImg)}`;
          const up = await supabase.storage.from('public-assets').upload(path, listImg, { contentType: listImg.type });
          if (up.error) throw new Error(up.error.message);
          image_url = supabase.storage.from('public-assets').getPublicUrl(path).data.publicUrl;
        }
        check(await supabase.from('public_vehicle_listings').upsert({
          vehicle_id: id, title: v.l_title.trim() || v.name, description: s(v.l_description), specs: s(v.l_specs),
          hire_info: s(v.l_hire_info), image_url, is_published: v.listed,
        }, { onConflict: 'vehicle_id' }));
      }
      toast.success(vehicle ? 'Vehicle updated' : 'Vehicle added');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save vehicle');
    } finally { setSaving(false); }
  };

  const E = (k: keyof V) => errors[k]?.message as string | undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Vehicle name *" error={E('name')}><Input {...register('name')} placeholder="e.g. School Bus 1" /></Field>
        <Field label="Registration number *" error={E('registration_number')}><Input {...register('registration_number')} className="uppercase" /></Field>
        <Field label="Type *"><Select {...register('vehicle_type')}><option value="bus">Bus</option><option value="van">Van</option><option value="three_wheeler">Three-wheeler</option><option value="other">Other</option></Select></Field>
        <Field label="Status"><Select {...register('status')}><option value="active">Active</option><option value="under_maintenance">Under maintenance</option><option value="unavailable">Unavailable</option><option value="inactive">Inactive</option></Select></Field>
        <Field label="Brand"><Input {...register('brand')} /></Field>
        <Field label="Model"><Input {...register('model')} /></Field>
        <Field label="Manufacturing year" error={E('manufacturing_year')}><Input inputMode="numeric" {...register('manufacturing_year')} /></Field>
        <Field label="Seating capacity *" error={E('seating_capacity')}><Input inputMode="numeric" {...register('seating_capacity')} /></Field>
        <Field label="Fuel type"><Select {...register('fuel_type')}>{['diesel', 'petrol', 'hybrid', 'electric', 'lpg', 'other'].map(f => <option key={f} value={f}>{f}</option>)}</Select></Field>
        <Field label="Fuel tank capacity (L)" error={E('fuel_tank_capacity')}><Input inputMode="decimal" {...register('fuel_tank_capacity')} /></Field>
        <Field label="Odometer (km)" error={E('odometer_km')}><Input inputMode="decimal" {...register('odometer_km')} /></Field>
        <Field label="Ownership information"><Input {...register('ownership_info')} placeholder="e.g. Owned / leased" /></Field>
        <Field label="Insurance expiry"><Input type="date" {...register('insurance_expiry')} /></Field>
        <Field label="Revenue licence expiry"><Input type="date" {...register('revenue_licence_expiry')} /></Field>
        <Field label="Emission test expiry"><Input type="date" {...register('emission_expiry')} /></Field>
        <Field label="Notes" className="sm:col-span-2" error={E('notes')}><Textarea rows={2} {...register('notes')} /></Field>
      </div>

      <div>
        <p className="text-sm font-bold text-ink-700 mb-2">Photographs (private)</p>
        <div className="flex flex-wrap gap-3">
          {photos.map(p => (
            <div key={p} className="relative h-20 w-24 rounded-2xl overflow-hidden bg-ink-100">
              {thumbs[p] && <img src={thumbs[p]} alt="" className="h-full w-full object-cover" />}
              <button type="button" aria-label="Remove photo" onClick={() => setPhotos(x => x.filter(y => y !== p))} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5"><X size={14} /></button>
            </div>
          ))}
          {newPhotos.map((f, i) => (
            <div key={i} className="relative h-20 w-24 rounded-2xl overflow-hidden bg-ink-100">
              <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setNewPhotos(x => x.filter((_, j) => j !== i))} className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5"><X size={14} /></button>
            </div>
          ))}
          <label className="h-20 w-24 rounded-2xl border-2 border-dashed border-ink-200 flex items-center justify-center text-xs font-bold text-ink-500 cursor-pointer hover:border-mint-400">
            + Add<input type="file" multiple accept={IMG.join(',')} className="hidden" onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </div>

      <div className="rounded-3xl border-2 border-mint-100 bg-mint-50/40 p-4 space-y-3">
        <label className="flex items-center gap-3 font-bold text-ink-800 cursor-pointer">
          <input type="checkbox" className="h-5 w-5 accent-teal-500" {...register('listed')} /> Show on public website
        </label>
        <p className="text-xs text-ink-500">Only the title, description, seats, fuel type and the text below are public. The registration number and notes are never shown.</p>
        {listed && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Public title *" error={E('l_title')}><Input {...register('l_title')} /></Field>
            <Field label="Hire availability info"><Input {...register('l_hire_info')} placeholder="e.g. Available for tours & weddings" /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea rows={2} {...register('l_description')} /></Field>
            <Field label="Basic specifications" className="sm:col-span-2"><Input {...register('l_specs')} placeholder="e.g. A/C, 40 seats, reclining seats" /></Field>
            <Field label="Public photo" hint={listing?.image_url ? 'A photo is set; choose a file to replace it.' : undefined}>
              <input type="file" accept={IMG.join(',')} onChange={e => { const f = e.target.files?.[0] ?? null; const bad = f && checkImg(f); if (bad) { toast.error(bad); return; } setListImg(f); }} className="text-sm" />
            </Field>
          </div>
        )}
      </div>

      <FormActions onCancel={onCancel} saving={saving} label={vehicle ? 'Save changes' : 'Add vehicle'} />
    </form>
  );
};

export default VehicleForm;
