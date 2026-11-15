import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase, type Booking, type Customer, type Driver, type DriverAssignment } from '../../lib/supabase';
import { check, unwrap } from '../../lib/db';
import { isoToLocalInput, localInputToIso } from '../../lib/time';
import { useToast } from '../../contexts/ToastContext';
import { Field, Input, Select, Textarea } from '../ui/Input';
import { FormActions } from './crud';

type VehOpt = { id: string; name: string; vehicle_type: string; seating_capacity: number };
type Conflict = { kind: string; severity: 'block' | 'warn'; message: string };

const num = (label: string) => z.string().refine(v => v === '' || (!isNaN(Number(v)) && Number(v) >= 0), `${label}: enter a valid amount`);
const schema = z.object({
  customer_id: z.string(), new_name: z.string().max(120), new_phone: z.string().max(20), new_email: z.string().max(200),
  vehicle_id: z.string().min(1, 'Choose a vehicle'),
  hire_type: z.enum(['bus_hire', 'van_hire', 'tuk_tuk_hire', 'private', 'other']),
  start_at: z.string().min(1, 'Required'), end_at: z.string().min(1, 'Required'),
  pickup_location: z.string().max(300), destination: z.string().max(300), return_location: z.string().max(300),
  passenger_count: z.string().refine(v => v === '' || (Number.isInteger(Number(v)) && Number(v) > 0), 'Whole number above 0'),
  distance_km: num('Distance'), agreed_price: num('Price'), advance_amount: num('Advance'), fuel_cost: num('Fuel cost'), other_expenses: num('Other expenses'),
  arrangement: z.enum(['owner_drives', 'external_driver', 'vehicle_only']), assigned_driver_id: z.string(), driver_fee: num('Driver fee'),
  status: z.enum(['inquiry', 'quotation_sent', 'confirmed', 'in_progress', 'completed', 'cancelled']), notes: z.string().max(1500),
}).superRefine((v, ctx) => {
  if (!v.customer_id) {
    if (v.new_name.trim().length < 2) ctx.addIssue({ code: 'custom', path: ['new_name'], message: 'Choose a customer or enter a name' });
    if (!/^[0-9+()\-\s]{7,20}$/.test(v.new_phone.trim())) ctx.addIssue({ code: 'custom', path: ['new_phone'], message: 'Enter a valid phone number' });
  }
  if (v.start_at && v.end_at && v.end_at <= v.start_at) ctx.addIssue({ code: 'custom', path: ['end_at'], message: 'End must be after start' });
  if (v.arrangement === 'external_driver' && !v.assigned_driver_id) ctx.addIssue({ code: 'custom', path: ['assigned_driver_id'], message: 'Choose the external driver' });
  if (Number(v.advance_amount || 0) > Number(v.agreed_price || 0)) ctx.addIssue({ code: 'custom', path: ['advance_amount'], message: 'Advance is more than the price' });
});
type V = z.infer<typeof schema>;
const n = (s: string) => (s === '' ? 0 : Number(s));
const s0 = (v: string) => (v.trim() === '' ? null : v.trim());
const digits = (p: string) => p.replace(/\D/g, '');

const TYPE_TO_HIRE: Record<string, V['hire_type']> = { bus: 'bus_hire', van: 'van_hire', three_wheeler: 'tuk_tuk_hire', other: 'other' };

const BookingForm: React.FC<{
  booking: Booking | null; customers: Customer[]; vehicles: VehOpt[]; drivers: Driver[];
  onDone: () => void; onCancel: () => void;
}> = ({ booking, customers, vehicles, drivers, onDone, onCancel }) => {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [assignment, setAssignment] = useState<DriverAssignment | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [checking, setChecking] = useState(false);

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<V>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: booking?.customer_id ?? '', new_name: '', new_phone: '', new_email: '', vehicle_id: booking?.vehicle_id ?? '',
      hire_type: booking?.hire_type ?? 'bus_hire', start_at: booking ? isoToLocalInput(booking.start_at) : '', end_at: booking ? isoToLocalInput(booking.end_at) : '',
      pickup_location: booking?.pickup_location ?? '', destination: booking?.destination ?? '', return_location: booking?.return_location ?? '',
      passenger_count: booking?.passenger_count?.toString() ?? '', distance_km: booking?.distance_km?.toString() ?? '', agreed_price: booking?.agreed_price?.toString() ?? '',
      advance_amount: booking?.advance_amount?.toString() ?? '', fuel_cost: booking?.fuel_cost?.toString() ?? '', other_expenses: booking?.other_expenses?.toString() ?? '',
      arrangement: booking?.arrangement ?? 'owner_drives', assigned_driver_id: booking?.assigned_driver_id ?? '', driver_fee: '',
      status: booking?.status ?? 'inquiry', notes: booking?.notes ?? '',
    },
  });
  const w = watch();

  useEffect(() => {
    if (!booking) return;
    supabase.from('booking_driver_assignments').select('*').eq('booking_id', booking.id).maybeSingle().then(({ data }) => {
      const a = data as DriverAssignment | null; setAssignment(a);
      if (a) reset(cur => ({ ...cur, driver_fee: String(a.agreed_fee) }));
    });
  }, [booking, reset]);

  // live availability check against the database
  useEffect(() => {
    if (!w.vehicle_id || !w.start_at || !w.end_at || w.end_at <= w.start_at) { setConflicts(null); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('check_vehicle_availability', {
        p_vehicle: w.vehicle_id, p_start: localInputToIso(w.start_at), p_end: localInputToIso(w.end_at),
        p_driver: w.assigned_driver_id || null, p_exclude: booking?.id ?? null,
      });
      setChecking(false);
      setConflicts(error ? [{ kind: 'error', severity: 'warn', message: error.message }] : (data as Conflict[]));
    }, 450);
    return () => clearTimeout(t);
  }, [w.vehicle_id, w.start_at, w.end_at, w.assigned_driver_id, booking?.id]);

  const owner = drivers.filter(d => d.is_owner);
  const external = drivers.filter(d => !d.is_owner);
  const veh = vehicles.find(v => v.id === w.vehicle_id);
  const seatWarn = veh && w.passenger_count && Number(w.passenger_count) > veh.seating_capacity;
  const blocking = (conflicts ?? []).filter(c => c.severity === 'block');
  const needsAvail = ['confirmed', 'in_progress'].includes(w.status);

  const onSubmit = async (v: V) => {
    if (needsAvail && blocking.length) { toast.error('Resolve the availability conflicts before confirming this booking.'); return; }
    setSaving(true);
    try {
      let customerId = v.customer_id;
      if (!customerId) {
        const existing = customers.find(c => digits(c.phone) === digits(v.new_phone));
        if (existing) { customerId = existing.id; toast.info(`Using existing customer ${existing.full_name}`); }
        else customerId = (unwrap(await supabase.from('customers').insert({ full_name: v.new_name.trim(), phone: v.new_phone.trim(), email: s0(v.new_email), category: 'individual' }).select('id').single()) as { id: string }).id;
      }
      const driverId = v.arrangement === 'vehicle_only' ? null : s0(v.assigned_driver_id);
      const row = {
        customer_id: customerId, vehicle_id: v.vehicle_id, hire_type: v.hire_type, start_at: localInputToIso(v.start_at), end_at: localInputToIso(v.end_at),
        pickup_location: s0(v.pickup_location), destination: s0(v.destination), return_location: s0(v.return_location),
        passenger_count: v.passenger_count ? Number(v.passenger_count) : null, distance_km: v.distance_km ? Number(v.distance_km) : null,
        agreed_price: n(v.agreed_price), advance_amount: n(v.advance_amount), fuel_cost: n(v.fuel_cost), other_expenses: n(v.other_expenses),
        arrangement: v.arrangement, assigned_driver_id: driverId, status: v.status, notes: s0(v.notes),
      };
      let id = booking?.id;
      if (booking) check(await supabase.from('hire_bookings').update(row).eq('id', booking.id));
      else id = (unwrap(await supabase.from('hire_bookings').insert(row).select('id').single()) as { id: string }).id;

      if (v.arrangement === 'external_driver' && driverId) {
        check(await supabase.from('booking_driver_assignments').upsert({ booking_id: id, driver_id: driverId, agreed_fee: n(v.driver_fee) }, { onConflict: 'booking_id' }));
      } else if (assignment && Number(assignment.advance_paid) === 0) {
        check(await supabase.from('booking_driver_assignments').delete().eq('id', assignment.id));
      }
      toast.success(booking ? 'Booking updated' : 'Booking created');
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save booking'); } finally { setSaving(false); }
  };

  const E = (k: keyof V) => errors[k]?.message as string | undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Customer" error={E('customer_id')}>
          <Select {...register('customer_id')}><option value="">+ New customer…</option>{customers.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.phone}</option>)}</Select>
        </Field>
        <Field label="Status"><Select {...register('status')}><option value="inquiry">Inquiry</option><option value="quotation_sent">Quotation sent</option><option value="confirmed">Confirmed</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></Select></Field>
        {!w.customer_id && <>
          <Field label="New customer name *" error={E('new_name')}><Input {...register('new_name')} /></Field>
          <Field label="New customer phone *" error={E('new_phone')}><Input type="tel" {...register('new_phone')} /></Field>
        </>}
        <Field label="Vehicle *" error={E('vehicle_id')}>
          <Select {...register('vehicle_id', { onChange: e => { const vv = vehicles.find(x => x.id === e.target.value); if (vv) setValue('hire_type', TYPE_TO_HIRE[vv.vehicle_type] ?? 'other'); } })}>
            <option value="">Select…</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.seating_capacity} seats)</option>)}
          </Select>
        </Field>
        <Field label="Hire type"><Select {...register('hire_type')}><option value="bus_hire">Bus hire</option><option value="van_hire">Van hire</option><option value="tuk_tuk_hire">Tuk Tuk hire</option><option value="private">Private transport</option><option value="other">Other</option></Select></Field>
        <Field label="Start (Sri Lanka time) *" error={E('start_at')}><Input type="datetime-local" {...register('start_at')} /></Field>
        <Field label="End (Sri Lanka time) *" error={E('end_at')}><Input type="datetime-local" {...register('end_at')} /></Field>
      </div>

      {w.vehicle_id && w.start_at && w.end_at && (
        <div className={`rounded-2xl p-3 text-sm font-semibold ${checking ? 'bg-ink-50 text-ink-500' : blocking.length ? 'bg-red-50 text-red-600' : 'bg-mint-50 text-mint-700'}`}>
          {checking ? 'Checking availability…' : blocking.length
            ? <div className="space-y-1"><p className="flex items-center gap-2"><AlertTriangle size={16} /> Not available for these times{needsAvail ? ' — cannot be confirmed' : ' (you can still save it as an inquiry/quotation)'}:</p><ul className="list-disc pl-6 font-medium">{blocking.map((c, i) => <li key={i}>{c.message}</li>)}</ul></div>
            : <p className="flex items-center gap-2"><CheckCircle2 size={16} /> Vehicle{w.assigned_driver_id ? ' and driver are' : ' is'} available.</p>}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Pickup location"><Input {...register('pickup_location')} /></Field>
        <Field label="Destination"><Input {...register('destination')} /></Field>
        <Field label="Return location"><Input {...register('return_location')} /></Field>
        <Field label="Passengers" error={E('passenger_count')} hint={seatWarn ? `Vehicle seats ${veh!.seating_capacity}` : undefined}><Input inputMode="numeric" {...register('passenger_count')} /></Field>
        <Field label="Distance estimate (km)" error={E('distance_km')}><Input inputMode="decimal" {...register('distance_km')} /></Field>
        <div />
        <Field label="Agreed price" error={E('agreed_price')}><Input inputMode="decimal" {...register('agreed_price')} /></Field>
        <Field label="Advance required" error={E('advance_amount')}><Input inputMode="decimal" {...register('advance_amount')} /></Field>
        <div />
        <Field label="Fuel cost (estimate)" error={E('fuel_cost')}><Input inputMode="decimal" {...register('fuel_cost')} /></Field>
        <Field label="Other expenses" error={E('other_expenses')}><Input inputMode="decimal" {...register('other_expenses')} /></Field>
      </div>

      <div className="rounded-3xl border-2 border-mint-100 bg-mint-50/40 p-4 grid sm:grid-cols-3 gap-4">
        <Field label="Driver arrangement"><Select {...register('arrangement', { onChange: () => setValue('assigned_driver_id', '') })}><option value="owner_drives">Owner drives</option><option value="external_driver">External driver assigned</option><option value="vehicle_only">Vehicle-only hire (no driver)</option></Select></Field>
        {w.arrangement !== 'vehicle_only' && (
          <Field label={w.arrangement === 'external_driver' ? 'Driver *' : 'Owner (as driver)'} error={E('assigned_driver_id')}>
            <Select {...register('assigned_driver_id')}><option value="">{w.arrangement === 'external_driver' ? 'Select…' : 'Not recorded'}</option>{(w.arrangement === 'external_driver' ? external : owner).map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</Select>
          </Field>)}
        {w.arrangement === 'external_driver' && <Field label="Agreed driver fee" error={E('driver_fee')}><Input inputMode="decimal" {...register('driver_fee')} /></Field>}
        {w.arrangement === 'vehicle_only' && <p className="sm:col-span-2 text-xs text-ink-500 self-center">Vehicle-only hire must follow your rental policy, licence checks and insurance terms.</p>}
      </div>

      <Field label="Notes"><Textarea rows={2} {...register('notes')} /></Field>
      <FormActions onCancel={onCancel} saving={saving} label={booking ? 'Save changes' : 'Create booking'} />
    </form>
  );
};

export default BookingForm;
