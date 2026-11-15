import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { AlertTriangle, Bus, CalendarClock, Download, GraduationCap, KeyRound, LogOut, MapPin, Receipt, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/db';
import { downloadReceipt } from '../lib/receipt';
import { fmtDateTime } from '../lib/time';
import { useQuery } from '../lib/queries';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { cn, formatMoney } from '../lib/utils';
import { Button } from '../components/ui/Button';
import RouteMap from '../components/maps/RouteMap';
import { googleDirectionsLink } from '../lib/maps';
import { Field, Input } from '../components/ui/Input';
import MustChangePassword from '../components/public/MustChangePassword';
import { ErrorState, Skeleton } from '../components/ui/Feedback';

// ----- the shapes returned by the portal_* database functions (curated columns only) -----
interface Stop { type: 'pickup' | 'dropoff'; name: string; time: string | null; lat: number | null; lng: number | null }
interface Route { name: string; departure_time: string; return_time: string; days: number[]; vehicle: string | null; stops: Stop[] }
interface Child { id: string; student_code: string; name: string; status: string; school: string; monthly_fee: number; pickup_location: string | null; dropoff_location: string | null; start_date: string; end_date: string | null; route: Route | null; outstanding: number }
interface Overview { students: Child[]; customers: { id: string; name: string; category: string }[] }
interface InvoiceRow { invoice_id: string; student_id: string; student_name: string; invoice_number: string; billing_month: string; total_payable: number; amount_paid: number; balance: number; status: string; due_date: string }
interface PaymentRow { payment_id: string; reference: string; payment_date: string; amount: number; method: string; kind: 'school' | 'advance' | 'hire'; person_name: string; for_text: string; balance_after: number | null }
interface BookingRow { booking_id: string; reference: string; customer_name: string; hire_type: string; status: string; start_at: string; end_at: string; pickup_location: string | null; destination: string | null; return_location: string | null; passenger_count: number | null; vehicle_name: string; vehicle_type: string; arrangement: string; agreed_price: number; paid: number; balance: number }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const ARRANGEMENT: Record<string, string> = { owner_drives: 'With the owner as driver', external_driver: 'With an assigned driver', vehicle_only: 'Vehicle only (no driver)' };

const PILL: Record<string, string> = {
  paid: 'bg-emerald-100 text-emerald-700', completed: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-100 text-emerald-700', confirmed: 'bg-navy-100 text-navy-800',
  in_progress: 'bg-navy-100 text-navy-800', partially_paid: 'bg-sunshine-100 text-sunshine-800', unpaid: 'bg-sunshine-100 text-sunshine-800', quotation_sent: 'bg-sunshine-100 text-sunshine-800',
  inquiry: 'bg-slate-100 text-slate-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-slate-100 text-slate-500', paused: 'bg-sunshine-100 text-sunshine-800', withdrawn: 'bg-slate-100 text-slate-500',
};
const Pill: React.FC<{ s: string }> = ({ s }) => <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap', PILL[s] ?? 'bg-slate-100 text-slate-700')}>{pretty(s)}</span>;

const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }> = ({ title, children, className, action }) => (
  <section className={cn('rounded-2xl bg-white border border-navy-100 shadow-sm p-5 sm:p-6', className)}>
    {(title || action) && <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-display text-lg font-bold text-navy-900">{title}</h2>{action}</div>}
    {children}
  </section>
);

const Stat: React.FC<{ label: string; value: string; icon: React.ReactNode; tone?: 'navy' | 'amber' | 'red' | 'green'; hint?: string }> = ({ label, value, icon, tone = 'navy', hint }) => (
  <div className="rounded-2xl bg-white border border-navy-100 shadow-sm p-5 flex items-start gap-4">
    <span className={cn('h-12 w-12 rounded-xl flex items-center justify-center shrink-0', tone === 'navy' && 'bg-navy-800 text-sunshine-400', tone === 'amber' && 'bg-sunshine-100 text-sunshine-800', tone === 'red' && 'bg-red-100 text-red-600', tone === 'green' && 'bg-emerald-100 text-emerald-700')}>{icon}</span>
    <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">{label}</p><p className="font-display text-2xl font-extrabold text-navy-900 truncate">{value}</p>{hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}</div>
  </div>
);

// ---------------------------------------------------------------- redeem an access code
const codeSchema = z.object({ code: z.string().trim().min(8, 'Enter the full code we gave you').max(20) });
const ClaimCard: React.FC<{ onLinked: () => void; first?: boolean }> = ({ onLinked, first }) => {
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(codeSchema) });
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className={first ? 'border-2 border-sunshine-300' : ''}>
      <div className="flex items-start gap-4">
        <span className="h-12 w-12 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center shrink-0"><KeyRound size={22} /></span>
        <div className="flex-1">
          <h2 className="font-display text-lg font-bold text-navy-900">{first ? 'Link your records with your access code' : 'Add another access code'}</h2>
          <p className="text-sm text-slate-600 mt-1">{first ? 'For your privacy, an account shows nothing until it is linked. Enter the one-time code we gave you when your child joined or your hire was booked.' : 'Got a code for another child or booking? Enter it here.'}</p>
          <form className="mt-4 flex flex-wrap items-start gap-3" noValidate onSubmit={handleSubmit(async v => {
            setError(null);
            const { data, error: e } = await supabase.rpc('portal_claim_invite', { p_code: v.code });
            if (e) { setError(friendlyError(e)); return; }
            const r = data as { ok: boolean; error?: string; students?: number; customers?: number };
            if (!r.ok) { setError(r.error ?? 'That code did not work.'); return; }
            toast.success(`Linked ${r.students ? `${r.students} student${r.students > 1 ? 's' : ''}` : ''}${r.students && r.customers ? ' and ' : ''}${r.customers ? 'your hire records' : ''}`);
            reset(); onLinked();
          })}>
            <div className="flex-1 min-w-[220px]"><Field label="Access code" error={errors.code?.message}><Input placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoCapitalize="characters" className="uppercase tracking-widest" {...register('code')} /></Field></div>
            <Button type="submit" variant="navy" loading={isSubmitting} className="mt-7">Link my records</Button>
          </form>
          {error && <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{error}</p>}
        </div>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------- tabs
const Overview: React.FC<{ ov: Overview; invoices: InvoiceRow[]; bookings: BookingRow[]; go: (t: string) => void }> = ({ ov, invoices, bookings, go }) => {
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const owed = invoices.filter(i => Number(i.balance) > 0);
  const outstanding = owed.reduce((a, i) => a + Number(i.balance), 0);
  const overdue = owed.filter(i => i.status === 'overdue').reduce((a, i) => a + Number(i.balance), 0);
  const nextDue = owed.map(i => i.due_date).sort()[0];
  const hireOwed = bookings.filter(b => b.status !== 'cancelled').reduce((a, b) => a + Number(b.balance), 0);
  const upcoming = bookings.filter(b => ['confirmed', 'in_progress'].includes(b.status) && new Date(b.end_at) >= new Date()).length;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {ov.students.length > 0 && <Stat label="School fees to pay" value={m(outstanding)} icon={<Wallet size={22} />} tone={overdue > 0 ? 'red' : outstanding > 0 ? 'amber' : 'green'}
          hint={overdue > 0 ? `${m(overdue)} is overdue` : nextDue ? `Next due ${format(new Date(nextDue + 'T00:00:00'), 'dd MMM yyyy')}` : 'You are all paid up'} />}
        {ov.customers.length > 0 && <Stat label="Hire balance" value={m(hireOwed)} icon={<Receipt size={22} />} tone={hireOwed > 0 ? 'amber' : 'green'} hint={hireOwed > 0 ? 'Across your active hires' : 'Nothing owing'} />}
        {ov.customers.length > 0 && <Stat label="Upcoming hires" value={String(upcoming)} icon={<CalendarClock size={22} />} hint="Confirmed trips" />}
      </div>

      {ov.students.map(c => (
        <Card key={c.id} title={c.name} action={<Pill s={c.status} />}>
          <p className="-mt-3 mb-4 text-sm text-slate-500">{c.student_code} · {c.school}</p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3 text-sm">
              <p className="flex gap-2.5"><GraduationCap size={18} className="text-navy-500 shrink-0" /><span><b>Monthly fee:</b> {m(Number(c.monthly_fee))}{Number(c.outstanding) > 0 && <span className="text-red-600 font-bold"> · {m(Number(c.outstanding))} outstanding</span>}</span></p>
              {c.pickup_location && <p className="flex gap-2.5"><MapPin size={18} className="text-navy-500 shrink-0" /><span><b>Pickup:</b> {c.pickup_location}</span></p>}
              {c.dropoff_location && <p className="flex gap-2.5"><MapPin size={18} className="text-navy-500 shrink-0" /><span><b>Drop-off:</b> {c.dropoff_location}</span></p>}
              <p className="text-xs text-slate-400">Joined {c.start_date}{c.end_date ? ` · ends ${c.end_date}` : ''}</p>
            </div>
            <div className="rounded-xl bg-navy-50 p-4 text-sm">
              {c.route ? <>
                <p className="font-bold text-navy-900 flex items-center gap-2"><Bus size={17} /> {c.route.name}{c.route.vehicle ? ` · ${c.route.vehicle}` : ''}</p>
                <p className="mt-1 text-slate-700">Leaves {hhmm(c.route.departure_time)} · returns {hhmm(c.route.return_time)}</p>
                <p className="text-slate-500 text-xs">{c.route.days.map(d => DAYS[d]).join(', ')}</p>
                {c.route.stops.length > 0 && <ol className="mt-3 space-y-1">{c.route.stops.map((s, i) => <li key={i} className="flex flex-wrap items-center gap-2 text-xs"><span className={cn('shrink-0 rounded px-1.5 font-extrabold uppercase', s.type === 'pickup' ? 'bg-navy-800 text-sunshine-300' : 'bg-sunshine-200 text-navy-900')}>{s.type}</span>{s.name}{s.time ? ` · ${hhmm(s.time)}` : ''}
                  {s.lat !== null && s.lng !== null && <a href={googleDirectionsLink({ lat: s.lat, lng: s.lng })} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-navy-700 underline"><MapPin size={11} /> Directions</a>}</li>)}</ol>}
              </> : <p className="text-slate-500">A route has not been assigned yet. We will let you know once it is.</p>}
            </div>
          </div>
          {c.route && c.route.stops.some(s => s.lat !== null && s.lng !== null) && (
            <div className="mt-5"><p className="text-xs font-extrabold uppercase tracking-wide text-slate-400 mb-2">Route map — pickup and drop-off points</p>
              <RouteMap stops={c.route.stops.filter(s => s.lat !== null && s.lng !== null).map(s => ({ name: s.name, type: s.type, lat: s.lat as number, lng: s.lng as number, time: s.time }))} height={300} /></div>)}
          <div className="mt-4"><Button variant="navyOutline" size="sm" onClick={() => go('payments')}>View fees &amp; payments</Button></div>
        </Card>
      ))}

      {ov.customers.length > 0 && (
        <Card title="Recent hires" action={<Button variant="navyGhost" size="sm" onClick={() => go('hires')}>See all</Button>}>
          {bookings.length === 0 ? <p className="text-sm text-slate-500">No hires yet.</p> :
            <ul className="divide-y divide-navy-100">{bookings.slice(0, 3).map(b => (
              <li key={b.booking_id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm"><span><b className="text-navy-900">{b.reference}</b> · {b.vehicle_name}<br /><span className="text-slate-500">{fmtDateTime(b.start_at)}{b.destination ? ` → ${b.destination}` : ''}</span></span><Pill s={b.status} /></li>))}</ul>}
        </Card>)}
    </div>
  );
};

const Payments: React.FC<{ invoices: InvoiceRow[]; payments: PaymentRow[] }> = ({ invoices, payments }) => {
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  const receipt = (p: PaymentRow) => downloadReceipt({ reference: p.reference, date: p.payment_date, amount: Number(p.amount), method: p.method, receivedFrom: p.person_name, forText: p.for_text, balanceAfter: p.balance_after === null ? null : Number(p.balance_after) }, settings);
  return (
    <div className="space-y-6">
      {invoices.length > 0 && (
        <Card title="Monthly school fees">
          <div className="overflow-x-auto -mx-2"><table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-xs font-extrabold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Month</th><th className="px-2">Student</th><th className="px-2 text-right">Fee</th><th className="px-2 text-right">Paid</th><th className="px-2 text-right">Balance</th><th className="px-2">Due</th><th className="px-2">Status</th></tr></thead>
            <tbody className="divide-y divide-navy-100">{invoices.map(i => (
              <tr key={i.invoice_id}><td className="px-2 py-2.5 font-bold text-navy-900">{format(new Date(i.billing_month + 'T00:00:00'), 'MMM yyyy')}<br /><span className="font-normal text-xs text-slate-400">{i.invoice_number}</span></td><td className="px-2">{i.student_name}</td>
                <td className="px-2 text-right tabular-nums">{m(Number(i.total_payable))}</td><td className="px-2 text-right tabular-nums">{m(Number(i.amount_paid))}</td><td className="px-2 text-right tabular-nums font-bold">{m(Number(i.balance))}</td>
                <td className="px-2 whitespace-nowrap">{i.due_date}</td><td className="px-2"><Pill s={i.status} /></td></tr>))}</tbody>
          </table></div>
          <p className="text-xs text-slate-500 mt-3">To pay, contact us or visit us. We record your payment and your receipt appears below.</p>
        </Card>)}
      <Card title="Payment history">
        {payments.length === 0 ? <p className="text-sm text-slate-500">No payments recorded yet.</p> : (
          <div className="overflow-x-auto -mx-2"><table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-xs font-extrabold uppercase tracking-wide text-slate-400"><th className="px-2 py-2">Date</th><th className="px-2">Receipt</th><th className="px-2">For</th><th className="px-2">Method</th><th className="px-2 text-right">Amount</th><th /></tr></thead>
            <tbody className="divide-y divide-navy-100">{payments.map(p => (
              <tr key={p.payment_id}><td className="px-2 py-2.5 whitespace-nowrap">{p.payment_date}</td><td className="px-2 font-bold text-navy-900">{p.reference}</td><td className="px-2">{p.for_text}<br /><span className="text-xs text-slate-400">{p.person_name}</span></td>
                <td className="px-2">{pretty(p.method)}</td><td className="px-2 text-right font-bold tabular-nums">{m(Number(p.amount))}</td>
                <td className="px-2 text-right"><button title="Download receipt" aria-label={`Download receipt ${p.reference}`} onClick={() => receipt(p)} className="p-2 rounded-lg hover:bg-navy-50 text-navy-700"><Download size={17} /></button></td></tr>))}</tbody>
          </table></div>)}
      </Card>
    </div>
  );
};

const Hires: React.FC<{ bookings: BookingRow[] }> = ({ bookings }) => {
  const { settings } = useSettings();
  const m = (n: number) => formatMoney(n, settings.currency);
  if (bookings.length === 0) return <Card><p className="text-slate-500 text-sm">You have no hires with us yet. <Link to="/contact#inquiry" className="font-bold text-navy-700 underline">Request a quote</Link>.</p></Card>;
  return (
    <div className="space-y-4">{bookings.map(b => (
      <Card key={b.booking_id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-display text-lg font-bold text-navy-900">{b.reference}</p><p className="text-sm text-slate-500">{pretty(b.hire_type)} · {b.vehicle_name} · {ARRANGEMENT[b.arrangement] ?? ''}</p></div>
          <Pill s={b.status} />
        </div>
        <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm">
          <div><dt className="text-xs font-extrabold uppercase text-slate-400">When</dt><dd className="font-semibold text-navy-900">{fmtDateTime(b.start_at)} → {fmtDateTime(b.end_at)}</dd></div>
          <div><dt className="text-xs font-extrabold uppercase text-slate-400">Route</dt><dd className="font-semibold text-navy-900">{[b.pickup_location, b.destination, b.return_location].filter(Boolean).join(' → ') || '—'}</dd></div>
          {b.passenger_count && <div><dt className="text-xs font-extrabold uppercase text-slate-400">Passengers</dt><dd className="font-semibold text-navy-900">{b.passenger_count}</dd></div>}
        </dl>
        {b.status !== 'cancelled' && <div className="grid grid-cols-3 gap-3 mt-4 text-center">
          {[['Price', Number(b.agreed_price)], ['Paid', Number(b.paid)], ['Balance', Number(b.balance)]].map(([k, v]) => (
            <div key={k as string} className={cn('rounded-xl p-3', k === 'Balance' && Number(v) > 0 ? 'bg-sunshine-100' : 'bg-navy-50')}><p className="text-xs font-extrabold uppercase text-slate-400">{k as string}</p><p className="font-display font-extrabold text-navy-900 tabular-nums">{m(v as number)}</p></div>))}
        </div>}
      </Card>))}</div>
  );
};

const pwSchema = z.object({ password: z.string().min(10, 'At least 10 characters'), confirm: z.string() }).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
const Profile: React.FC<{ ov: Overview; onLinked: () => void }> = ({ ov, onLinked }) => {
  const { userEmail, userName, updatePassword } = useAuth();
  const toast = useToast();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(pwSchema) });
  return (
    <div className="space-y-6">
      <Card title="Your details">
        <dl className="grid sm:grid-cols-2 gap-4 text-sm"><div><dt className="text-xs font-extrabold uppercase text-slate-400">Name</dt><dd className="font-semibold text-navy-900">{userName ?? '—'}</dd></div><div><dt className="text-xs font-extrabold uppercase text-slate-400">Email</dt><dd className="font-semibold text-navy-900 break-all">{userEmail}</dd></div></dl>
        <p className="text-sm text-slate-600 mt-4">Linked to: {ov.students.length ? ov.students.map(s => s.name).join(', ') : 'no students'}{ov.customers.length ? ` · hire records for ${ov.customers.map(c => c.name).join(', ')}` : ''}</p>
        <p className="mt-4 flex gap-2 text-xs text-slate-500"><ShieldCheck size={16} className="text-navy-500 shrink-0" />Only the records linked to you are shown. Need a name, phone number or record corrected? Please contact us.</p>
      </Card>
      <ClaimCard onLinked={onLinked} />
      <Card title="Change password">
        <form className="grid sm:grid-cols-2 gap-4 max-w-xl" noValidate onSubmit={handleSubmit(async v => {
          try { await updatePassword(v.password); toast.success('Password updated'); reset(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update password'); }
        })}>
          <Field label="New password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
          <Field label="Confirm" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
          <div className="sm:col-span-2"><Button type="submit" variant="navy" loading={isSubmitting}>Update password</Button></div>
        </form>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------- page
const TABS = [{ key: 'overview', label: 'Overview', icon: UserRound }, { key: 'payments', label: 'Fees & payments', icon: Wallet }, { key: 'hires', label: 'My hires', icon: Bus }, { key: 'profile', label: 'Profile', icon: ShieldCheck }];

const Account: React.FC = () => {
  const { authUserId, loading, userName, signOut, mustChangePassword, isAdmin, kind } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');

  const load = useQuery(async () => {
    const [o, i, p, b] = await Promise.all([supabase.rpc('portal_overview'), supabase.rpc('portal_invoices'), supabase.rpc('portal_payments'), supabase.rpc('portal_bookings')]);
    for (const r of [o, i, p, b]) if (r.error) throw new Error(friendlyError(r.error));
    return { ov: o.data as Overview, invoices: (i.data ?? []) as InvoiceRow[], payments: (p.data ?? []) as PaymentRow[], bookings: (b.data ?? []) as BookingRow[] };
  }, null as { ov: Overview; invoices: InvoiceRow[]; payments: PaymentRow[]; bookings: BookingRow[] } | null, [authUserId]);

  if (loading || (authUserId && !isAdmin && !kind)) return <div className="py-32 text-center text-slate-400 font-bold" role="status">Loading…</div>;
  if (!authUserId) return <Navigate to="/account/login?next=/account" replace />;
  if (kind?.driver && !kind.family) return <Navigate to="/driver" replace />;     // a driver's login has his own page

  const d = load.data;
  const linked = !!d && (d.ov.students.length > 0 || d.ov.customers.length > 0);
  const first = (userName ?? '').split(' ')[0];

  return (
    <div className="bg-navy-50/60 min-h-[70vh]">
      <section className="bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 text-white">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sunshine-300">My account</p><h1 className="font-display text-3xl sm:text-4xl font-extrabold">{first ? `Hello, ${first}` : 'Welcome'}</h1></div>
          <Button variant="lightOutline" size="sm" onClick={async () => { await signOut(); navigate('/'); }}><LogOut size={16} /> Sign out</Button>
        </div>
      </section>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {mustChangePassword && <MustChangePassword />}
        {mustChangePassword ? null : load.loading ? <Skeleton className="h-64" /> : load.error ? <ErrorState message={load.error} onRetry={load.reload} /> : d && (
          !linked ? (<>
            <ClaimCard first onLinked={load.reload} />
            <Card title="Don’t have a code yet?"><p className="text-sm text-slate-600 flex gap-3"><AlertTriangle size={18} className="text-sunshine-600 shrink-0 mt-0.5" />We give an access code to each parent when a child joins school transport, and to customers when a hire is booked. If you haven’t received yours, <Link to="/contact" className="font-bold text-navy-700 underline">contact us</Link> and we will send it to you.</p></Card>
          </>) : (<>
            <nav className="flex gap-1 overflow-x-auto rounded-xl bg-white border border-navy-100 p-1.5 shadow-sm" aria-label="Account sections">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition', tab === t.key ? 'bg-navy-800 text-white' : 'text-navy-700 hover:bg-navy-50')}><t.icon size={16} />{t.label}</button>))}
            </nav>
            {tab === 'overview' && <Overview ov={d.ov} invoices={d.invoices} bookings={d.bookings} go={setTab} />}
            {tab === 'payments' && <Payments invoices={d.invoices} payments={d.payments} />}
            {tab === 'hires' && <Hires bookings={d.bookings} />}
            {tab === 'profile' && <Profile ov={d.ov} onLinked={load.reload} />}
          </>))}
      </div>
    </div>
  );
};

export default Account;
