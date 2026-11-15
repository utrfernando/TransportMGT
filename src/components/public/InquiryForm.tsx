import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, MessageCircle, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSettings } from '../../contexts/SettingsContext';
import { usePublicServices, usePublicVehicles } from '../../lib/queries';
import { whatsappLink } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Input';

export const SERVICE_OPTIONS = [
  'School transport', 'Bus hire', 'Van hire', 'Tuk Tuk hire', 'Private transport', 'Driver-provided transport', 'Vehicle-only hire',
];

const schema = z.object({
  customer_name: z.string().trim().min(2, 'Please enter your name').max(120),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid contact number'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  service: z.string().min(1, 'Choose a service'),
  preferred_vehicle: z.string().max(120).optional(),
  pickup_location: z.string().trim().max(300).optional(),
  destination: z.string().trim().max(300).optional(),
  travel_date: z.string().optional().refine(v => !v || v >= new Date().toISOString().slice(0, 10), 'Date cannot be in the past'),
  passenger_count: z.string().optional().refine(v => !v || (Number(v) >= 1 && Number(v) <= 200), 'Enter 1–200'),
  driver_requirement: z.string().optional(),
  message: z.string().trim().max(2000).optional(),
});
type FormValues = z.infer<typeof schema>;

const InquiryForm: React.FC<{ defaultService?: string; defaultVehicle?: string }> = ({ defaultService, defaultVehicle }) => {
  const { settings } = useSettings();
  const vehicles = usePublicVehicles();
  const services = usePublicServices();
  // the service list comes from Admin → Website → Services (falls back to the defaults if none are published)
  const serviceOptions = services.data.length ? services.data.map(x => x.title) : SERVICE_OPTIONS;
  const [done, setDone] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { service: defaultService ?? '', email: '', driver_requirement: 'any', preferred_vehicle: defaultVehicle ?? '' },
  });

  const onSubmit = async (v: FormValues) => {
    setSubmitError(null);
    const { data, error } = await supabase.rpc('submit_inquiry', {
      p_name: v.customer_name, p_phone: v.phone, p_email: v.email || null, p_service: v.service,
      p_vehicle: v.preferred_vehicle || null, p_pickup: v.pickup_location || null, p_destination: v.destination || null,
      p_travel_date: v.travel_date || null, p_passengers: v.passenger_count ? Number(v.passenger_count) : null,
      p_driver: v.driver_requirement || null, p_message: v.message || null,
    });
    if (error) { setSubmitError(error.message); return; }
    setDone(data as string);
    reset();
  };

  const w = watch();
  const waText = `Hello ${settings.business_name}, I would like a quotation.\nService: ${w.service || '-'}${w.preferred_vehicle ? `\nVehicle: ${w.preferred_vehicle}` : ''}${w.pickup_location ? `\nFrom: ${w.pickup_location}` : ''}${w.destination ? `\nTo: ${w.destination}` : ''}${w.travel_date ? `\nDate: ${w.travel_date}` : ''}${w.passenger_count ? `\nPassengers: ${w.passenger_count}` : ''}${w.customer_name ? `\nName: ${w.customer_name}` : ''}`;
  const wa = whatsappLink(settings.whatsapp, waText);

  if (services.loading) return <div className="h-64 animate-pulse rounded-3xl bg-ink-100" />;

  if (done) {
    return (
      <div className="text-center py-10">
        <CheckCircle2 className="mx-auto text-mint-500 mb-3" size={56} />
        <h3 className="font-display text-2xl font-extrabold text-ink-900">Thank you! Inquiry received</h3>
        <p className="text-ink-500 mt-2">Your reference is <b className="text-ink-900">{done}</b>. We will contact you shortly.</p>
        <Button className="mt-6" variant="outline" onClick={() => setDone(null)}>Send another inquiry</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Your name *" error={errors.customer_name?.message}><Input {...register('customer_name')} autoComplete="name" /></Field>
      <Field label="Contact number *" error={errors.phone?.message}><Input {...register('phone')} type="tel" autoComplete="tel" placeholder="07x xxx xxxx" /></Field>
      <Field label="Email (optional)" error={errors.email?.message}><Input {...register('email')} type="email" autoComplete="email" /></Field>
      <Field label="Service required *" error={errors.service?.message}>
        <Select {...register('service')}>
          <option value="">Select a service…</option>
          {serviceOptions.map(s => <option key={s}>{s}</option>)}
        </Select>
      </Field>
      <Field label="Preferred vehicle">
        <Select {...register('preferred_vehicle')}>
          <option value="">No preference</option>
          {vehicles.data.map(v => <option key={v.id} value={v.title}>{v.title} ({v.seating_capacity} seats)</option>)}
          {vehicles.data.length === 0 && <><option>Bus</option><option>Van</option><option>Tuk Tuk</option></>}
        </Select>
      </Field>
      <Field label="Driver requirement">
        <Select {...register('driver_requirement')}>
          <option value="any">No preference</option>
          <option value="owner_drives">Owner drives</option>
          <option value="external_driver">Assigned driver</option>
          <option value="vehicle_only">Vehicle only (no driver)</option>
        </Select>
      </Field>
      <Field label="Pickup location" error={errors.pickup_location?.message}><Input {...register('pickup_location')} /></Field>
      <Field label="Destination" error={errors.destination?.message}><Input {...register('destination')} /></Field>
      <Field label="Travel date" error={errors.travel_date?.message}><Input {...register('travel_date')} type="date" min={new Date().toISOString().slice(0, 10)} /></Field>
      <Field label="Number of passengers" error={errors.passenger_count?.message}><Input {...register('passenger_count')} type="number" min={1} max={200} /></Field>
      <Field label="Additional message" className="sm:col-span-2" error={errors.message?.message}><Textarea {...register('message')} rows={4} /></Field>

      {submitError && <p className="sm:col-span-2 text-sm font-semibold text-red-500">{submitError}</p>}
      <div className="sm:col-span-2 flex flex-wrap gap-3">
        <Button type="submit" size="lg" loading={isSubmitting}><Send size={18} /> Send inquiry</Button>
        {wa && <a href={wa} target="_blank" rel="noreferrer"><Button type="button" variant="outline" size="lg"><MessageCircle size={18} /> Send via WhatsApp</Button></a>}
      </div>
    </form>
  );
};

export default InquiryForm;
