import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Upload } from 'lucide-react';
import { supabase, type BusinessSettings } from '../../lib/supabase';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { AdminHeader, Card } from '../../components/admin/ui';
import { Button } from '../../components/ui/Button';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';

const url = z.string().trim().url('Enter a full URL (https://…)').or(z.literal(''));
const schema = z.object({
  business_name: z.string().trim().min(2, 'Required').max(80),
  tagline: z.string().trim().max(160),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(30),
  whatsapp: z.string().trim().max(30),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  maps_url: url, facebook: url, instagram: url, tiktok: url, youtube: url,
  about_text: z.string().max(4000), mission: z.string().max(1000), vision: z.string().max(1000),
  booking_terms: z.string().max(4000),
  currency: z.string().trim().min(3).max(3),
  invoice_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, 'Up to 8 capital letters/digits'),
  receipt_prefix: z.string().trim().regex(/^[A-Z0-9]{1,8}$/, 'Up to 8 capital letters/digits'),
  default_due_days: z.coerce.number().int().min(0).max(90),
  partial_month: z.enum(['prorate_by_days', 'full_month']),
  document_expiry_days: z.coerce.number().int().min(1).max(365),
  service_reminder_days: z.coerce.number().int().min(1).max(365),
  booking_reminder_days: z.coerce.number().int().min(1).max(60),
});
type V = z.input<typeof schema>;

const AdminSettings: React.FC = () => {
  const toast = useToast();
  const { refresh } = useSettings();
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const q = useQuery(async () => {
    const { data, error } = await supabase.from('business_settings').select('*').eq('id', 1).single();
    if (error) throw new Error(error.message);
    return data as BusinessSettings;
  }, null as BusinessSettings | null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<V>({ resolver: zodResolver(schema) as never });

  useEffect(() => {
    const s = q.data;
    if (!s) return;
    setLogoUrl(s.logo_url);
    reset({
      business_name: s.business_name, tagline: s.tagline ?? '', address: s.address ?? '', phone: s.phone ?? '', whatsapp: s.whatsapp ?? '', email: s.email ?? '',
      maps_url: s.maps_url ?? '', facebook: s.social?.facebook ?? '', instagram: s.social?.instagram ?? '', tiktok: s.social?.tiktok ?? '', youtube: s.social?.youtube ?? '',
      about_text: s.about_text ?? '', mission: s.mission ?? '', vision: s.vision ?? '', booking_terms: s.booking_terms ?? '',
      currency: s.currency, invoice_prefix: s.invoice_prefix, receipt_prefix: s.receipt_prefix, default_due_days: s.default_due_days,
      partial_month: s.billing_rules?.partial_month ?? 'prorate_by_days',
      document_expiry_days: s.notification_prefs?.document_expiry_days ?? 30,
      service_reminder_days: s.notification_prefs?.service_reminder_days ?? 14,
      booking_reminder_days: s.notification_prefs?.booking_reminder_days ?? 2,
    });
  }, [q.data, reset]);

  const onSubmit = async (raw: V) => {
    const v = schema.parse(raw);
    const social = Object.fromEntries(Object.entries({ facebook: v.facebook, instagram: v.instagram, tiktok: v.tiktok, youtube: v.youtube }).filter(([, x]) => x));
    const { error } = await supabase.from('business_settings').update({
      business_name: v.business_name, tagline: v.tagline, address: v.address || null, phone: v.phone || null, whatsapp: v.whatsapp || null,
      email: v.email || null, maps_url: v.maps_url || null, social, about_text: v.about_text || null, mission: v.mission || null, vision: v.vision || null,
      booking_terms: v.booking_terms || null, currency: v.currency.toUpperCase(), invoice_prefix: v.invoice_prefix, receipt_prefix: v.receipt_prefix,
      default_due_days: v.default_due_days,
      billing_rules: { partial_month: v.partial_month, bill_on_day: 1 },
      notification_prefs: { document_expiry_days: v.document_expiry_days, service_reminder_days: v.service_reminder_days, booking_reminder_days: v.booking_reminder_days },
    }).eq('id', 1);
    if (error) { toast.error(error.message); return; }
    toast.success('Settings saved');
    await refresh();
    q.reload();
  };

  const uploadLogo = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { toast.error('Logo must be PNG, JPG or WebP'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return; }
    setLogoBusy(true);
    const ext = file.type.split('/')[1];
    const path = `branding/logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from('public-assets').upload(path, file, { upsert: false, contentType: file.type });
    if (up.error) { setLogoBusy(false); toast.error(up.error.message); return; }
    const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
    const { error } = await supabase.from('business_settings').update({ logo_url: data.publicUrl }).eq('id', 1);
    setLogoBusy(false);
    if (error) { toast.error(error.message); return; }
    setLogoUrl(data.publicUrl);
    toast.success('Logo updated');
    refresh();
  };

  if (q.loading) return <Skeleton className="h-96" />;
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;

  const E = (k: keyof V) => errors[k]?.message as string | undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <AdminHeader title="Business Settings" subtitle="Name, contact details, website content and billing rules"
        actions={<Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save changes</Button>} />
      <div className="space-y-6">
        <Card title="Brand">
          <div className="flex items-center gap-4 mb-5">
            <div className="h-20 w-20 rounded-3xl bg-mint-50 border border-ink-100 flex items-center justify-center overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" /> : <span className="text-xs text-ink-400 font-bold">No logo</span>}
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-full border-2 border-mint-500 text-mint-700 font-bold px-5 py-2 hover:bg-mint-50">
              <Upload size={16} /> {logoBusy ? 'Uploading…' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={logoBusy} onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Business name *" error={E('business_name')}><Input {...register('business_name')} /></Field>
            <Field label="Tagline" error={E('tagline')}><Input {...register('tagline')} /></Field>
          </div>
        </Card>

        <Card title="Contact & social">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Telephone" error={E('phone')}><Input {...register('phone')} /></Field>
            <Field label="WhatsApp number" hint="Include country code, e.g. 94771234567" error={E('whatsapp')}><Input {...register('whatsapp')} /></Field>
            <Field label="Email" error={E('email')}><Input {...register('email')} /></Field>
            <Field label="Google Maps link" error={E('maps_url')}><Input {...register('maps_url')} placeholder="https://maps.google.com/…" /></Field>
            <Field label="Address" className="sm:col-span-2" error={E('address')}><Textarea rows={2} {...register('address')} /></Field>
            <Field label="Facebook" error={E('facebook')}><Input {...register('facebook')} /></Field>
            <Field label="Instagram" error={E('instagram')}><Input {...register('instagram')} /></Field>
            <Field label="TikTok" error={E('tiktok')}><Input {...register('tiktok')} /></Field>
            <Field label="YouTube" error={E('youtube')}><Input {...register('youtube')} /></Field>
          </div>
        </Card>

        <Card title="Website content">
          <div className="grid gap-4">
            <Field label="About us" error={E('about_text')}><Textarea rows={4} {...register('about_text')} /></Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Mission" error={E('mission')}><Textarea rows={3} {...register('mission')} /></Field>
              <Field label="Vision" error={E('vision')}><Textarea rows={3} {...register('vision')} /></Field>
            </div>
            <Field label="Booking terms" error={E('booking_terms')}><Textarea rows={4} {...register('booking_terms')} /></Field>
          </div>
        </Card>

        <Card title="Billing & notifications">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Currency" hint="Default LKR" error={E('currency')}><Input {...register('currency')} maxLength={3} /></Field>
            <Field label="Invoice prefix" error={E('invoice_prefix')}><Input {...register('invoice_prefix')} /></Field>
            <Field label="Receipt prefix" error={E('receipt_prefix')}><Input {...register('receipt_prefix')} /></Field>
            <Field label="Default payment due (days)" error={E('default_due_days')}><Input type="number" {...register('default_due_days')} /></Field>
            <Field label="Part-month billing" className="sm:col-span-2">
              <Select {...register('partial_month')}>
                <option value="prorate_by_days">Pro-rate by days when a student joins/leaves mid-month</option>
                <option value="full_month">Charge the full month</option>
              </Select>
            </Field>
            <Field label="Document expiry alert (days)" error={E('document_expiry_days')}><Input type="number" {...register('document_expiry_days')} /></Field>
            <Field label="Service reminder (days)" error={E('service_reminder_days')}><Input type="number" {...register('service_reminder_days')} /></Field>
            <Field label="Booking reminder (days)" error={E('booking_reminder_days')}><Input type="number" {...register('booking_reminder_days')} /></Field>
          </div>
          <p className="text-xs text-ink-400 mt-4">Timezone is fixed to Asia/Colombo.</p>
        </Card>
      </div>
    </form>
  );
};

export default AdminSettings;
