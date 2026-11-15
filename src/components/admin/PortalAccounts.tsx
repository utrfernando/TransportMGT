import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Ban, Check, Copy, KeyRound, Mail, MessageCircle, RefreshCw, ShieldCheck, UserPlus, UserX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/db';
import { callPortalApi, generatePassword, type AccountStatus, type CreateResult } from '../../lib/portalApi';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { whatsappLink } from '../../lib/utils';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Field, Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

type Mode = 'invite' | 'password';

export interface AccountTarget { driverId?: string; studentIds?: string[]; customerIds?: string[]; name?: string; email?: string; phone?: string; label?: string }

// ------------------------------------------------------------------------------------------ create
/** Create (or link) the online login for a student's family or a hire customer. */
export const AccountModal: React.FC<{ open: boolean; target: AccountTarget; onClose: () => void; onDone: () => void }> = ({ open, target, onClose, onDone }) => {
  const { settings } = useSettings();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<Mode>('invite');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(CreateResult & { password?: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(target.name ?? ''); setEmail(target.email ?? ''); setMode('invite'); setPassword(''); setShow(false); setError(null); setResult(null); setCopied(false);
  }, [open, target.name, target.email]);

  const count = (target.studentIds?.length ?? 0) + (target.customerIds?.length ?? 0) + (target.driverId ? 1 : 0);
  const valid = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && (mode === 'invite' || password.length >= 10);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = target.driverId
        ? await callPortalApi<CreateResult>({ action: 'create_driver', email: email.trim(), driver_id: target.driverId, mode, password: mode === 'password' ? password : undefined })
        : await callPortalApi<CreateResult>({ action: 'create', email: email.trim(), full_name: name.trim(), phone: target.phone || undefined, student_ids: target.studentIds ?? [], customer_ids: target.customerIds ?? [], mode, password: mode === 'password' ? password : undefined });
      setResult({ ...r, password: mode === 'password' && r.created ? password : undefined });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the account'); } finally { setBusy(false); }
  };

  const loginUrl = `${window.location.origin}/account/login`;
  const message = result?.password ? `Hello ${name}, your ${settings.business_name} online account is ready.\n\nSign in: ${loginUrl}\nEmail: ${result.email}\nTemporary password: ${result.password}\n\nYou will be asked to choose your own password the first time you sign in.` : '';
  const wa = result?.password && target.phone ? whatsappLink(target.phone, message) : null;

  return (
    <Modal open={open} onClose={onClose} wide title={result ? 'Account ready' : 'Create online account'}>
      {result ? (
        <div className="space-y-5 text-center">
          {result.mode === 'password' && result.password && <>
            <p className="text-sm text-ink-600">Give these sign-in details to <b>{name}</b>. <b className="text-red-600">The password is shown only now</b>; they will be asked to choose their own at first sign-in.</p>
            <div className="rounded-3xl bg-mint-50 p-5 text-left space-y-1 select-all"><p className="text-sm"><span className="text-ink-500">Sign in at:</span> <b>{loginUrl}</b></p><p className="text-sm"><span className="text-ink-500">Email:</span> <b>{result.email}</b></p>
              <p className="text-sm"><span className="text-ink-500">Password:</span> <b className="font-mono text-base tracking-wider">{result.password}</b></p></div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={async () => { await navigator.clipboard.writeText(message); setCopied(true); }}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy message'}</Button>
              {wa && <a href={wa} target="_blank" rel="noreferrer"><Button variant="outline"><MessageCircle size={16} /> Send on WhatsApp</Button></a>}
            </div></>}
          {result.mode === 'invite' && <p className="text-ink-700"><Mail className="mx-auto mb-2 text-mint-600" size={36} />An invitation email was sent to <b>{result.email}</b>. They open the link, choose a password and can then sign in. Check your spam folder if it doesn’t arrive, and see <i>Business Settings → email</i> if you have not added your own email sender yet.</p>}
          {result.mode === 'existing' && <p className="text-ink-700"><ShieldCheck className="mx-auto mb-2 text-mint-600" size={36} /><b>{result.email}</b> already has a login, so it was simply linked to {target.driverId ? 'this driver' : <>{result.linked?.students ? `${result.linked.students} student(s)` : ''}{result.linked?.students && result.linked?.customers ? ' and ' : ''}{result.linked?.customers ? 'the customer record' : ''}</>}. Their password was not changed.</p>}
          <div><Button variant="ghost" onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-600">{target.label ? <>For <b>{target.label}</b>. </> : null}They will sign in at <b>{window.location.origin}/account</b> and see only {target.driverId ? 'what you have assigned to this driver: his routes, students, vehicles and hire trips. No fees, payments or prices.' : <>{count > 1 ? 'these records' : 'this record'}: route and timings, fees, payments, receipts and hires.</>}</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={target.driverId ? 'Driver name *' : 'Parent / guardian name *'}><Input value={name} onChange={e => setName(e.target.value)} maxLength={120} /></Field>
            <Field label="Email address *" hint="This becomes the sign-in name."><Input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={200} autoComplete="off" /></Field>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-bold text-ink-700 mb-1.5">How should they get their password?</legend>
            {([['invite', 'Email them an invitation', 'They get an email with a link to choose their own password. Best choice — you never know the password.'], ['password', 'I will set a password now', 'You choose the password and tell the family. They must change it at first sign-in.']] as [Mode, string, string][]).map(([k, t, d]) => (
              <label key={k} className={`flex gap-3 rounded-2xl border-2 p-3 cursor-pointer ${mode === k ? 'border-mint-400 bg-mint-50' : 'border-ink-100'}`}><input type="radio" name="mode" className="mt-1 accent-teal-500" checked={mode === k} onChange={() => setMode(k)} /><span><b className="text-sm">{t}</b><br /><span className="text-xs text-ink-500">{d}</span></span></label>))}
          </fieldset>
          {mode === 'password' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px]"><Field label="Password * (at least 10 characters)"><Input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} maxLength={72} autoComplete="new-password" className="font-mono" /></Field></div>
              <Button type="button" variant="outline" onClick={() => { setPassword(generatePassword()); setShow(true); }}><RefreshCw size={16} /> Generate</Button>
              <Button type="button" variant="ghost" onClick={() => setShow(s => !s)}>{show ? 'Hide' : 'Show'}</Button>
            </div>)}
          {error && <p className="rounded-2xl bg-red-50 text-red-600 text-sm font-semibold p-3" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!valid || count === 0}><UserPlus size={16} /> {mode === 'invite' ? 'Create & email invitation' : 'Create account'}</Button></div>
        </div>
      )}
    </Modal>
  );
};

// ---------------------------------------------------------------------------------- set password
export const SetPasswordModal: React.FC<{ userId: string | null; email?: string; onClose: () => void }> = ({ userId, email, onClose }) => {
  const toast = useToast();
  const { settings } = useSettings();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { setPassword(''); setError(null); setDone(false); }, [userId]);
  const submit = async () => {
    if (!userId) return;
    setBusy(true); setError(null);
    try { await callPortalApi({ action: 'set_password', user_id: userId, password }); setDone(true); toast.success('Password changed'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not change the password'); } finally { setBusy(false); }
  };
  const msg = `Hello, your ${settings.business_name} online account password has been reset.\n\nSign in: ${window.location.origin}/account/login\nEmail: ${email}\nTemporary password: ${password}\n\nYou will be asked to choose your own password.`;
  return (
    <Modal open={!!userId} onClose={onClose} title="Set a new password">
      {done ? (
        <div className="space-y-4 text-center"><p className="text-sm text-ink-600">Tell the family their new temporary password. They will be asked to change it at next sign-in.</p>
          <p className="font-mono text-2xl font-extrabold tracking-wider bg-mint-50 rounded-3xl py-4 select-all">{password}</p>
          <div className="flex justify-center gap-2"><Button onClick={() => navigator.clipboard.writeText(msg)}><Copy size={16} /> Copy message</Button><Button variant="ghost" onClick={onClose}>Done</Button></div></div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-600">Set a temporary password for <b>{email}</b>. They must choose their own at next sign-in. Prefer not to know their password? Use <b>Email a reset link</b> instead.</p>
          <div className="flex flex-wrap items-end gap-3"><div className="flex-1 min-w-[200px]"><Field label="New password (10+ characters)"><Input value={password} onChange={e => setPassword(e.target.value)} maxLength={72} className="font-mono" autoComplete="off" /></Field></div>
            <Button variant="outline" onClick={() => setPassword(generatePassword())}><RefreshCw size={16} /> Generate</Button></div>
          {error && <p className="rounded-2xl bg-red-50 text-red-600 text-sm font-semibold p-3" role="alert">{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={password.length < 10}>Set password</Button></div>
        </div>)}
    </Modal>
  );
};

// ------------------------------------------------------------------------------ status helpers
export const statusBadge = (s?: AccountStatus) => !s ? <Badge color="ink">…</Badge>
  : s.banned ? <Badge color="red">Login disabled</Badge>
  : !s.confirmed ? <Badge color="sunshine">Invitation not accepted yet</Badge>
  : s.must_change_password && !s.last_sign_in_at ? <Badge color="sunshine">Never signed in</Badge>
  : s.last_sign_in_at ? <Badge color="green">Active</Badge> : <Badge color="sunshine">Never signed in</Badge>;

/** Fetch sign-in status for a set of logins from the server API. */
export function useAccountStatuses(userIds: string[]) {
  const key = [...userIds].sort().join(',');
  return useQuery(async () => {
    if (userIds.length === 0) return {} as Record<string, AccountStatus>;
    const r = await callPortalApi<{ users: AccountStatus[] }>({ action: 'status', user_ids: userIds.slice(0, 50) });
    return Object.fromEntries(r.users.map(u => [u.id, u]));
  }, {} as Record<string, AccountStatus>, [key]);
}

/** Actions for one family login: reset email, new password, disable/enable. */
export const AccountActions: React.FC<{ userId: string; email: string; status?: AccountStatus; onChanged: () => void }> = ({ userId, email, status, onChanged }) => {
  const toast = useToast();
  const [pw, setPw] = useState(false);
  const [confirmBan, setConfirmBan] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast.success(ok); onChanged(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); setConfirmBan(false); } };
  return (
    <span className="inline-flex flex-wrap gap-1 justify-end">
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => callPortalApi({ action: 'send_reset', user_id: userId }), `Reset link emailed to ${email}`)}><Mail size={14} /> Email reset link</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPw(true)}><KeyRound size={14} /> Set password</Button>
      {status?.banned
        ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => callPortalApi({ action: 'set_banned', user_id: userId, banned: false }), 'Login enabled')}><Check size={14} /> Enable login</Button>
        : <Button size="sm" variant="ghost" disabled={busy} className="text-red-600" onClick={() => setConfirmBan(true)}><Ban size={14} /> Disable login</Button>}
      <SetPasswordModal userId={pw ? userId : null} email={email} onClose={() => { setPw(false); onChanged(); }} />
      <ConfirmDialog open={confirmBan} danger title="Disable this login?" confirmLabel="Disable" message={`${email} will not be able to sign in until you enable it again. Their records and links are kept.`} onClose={() => setConfirmBan(false)} onConfirm={() => run(() => callPortalApi({ action: 'set_banned', user_id: userId, banned: true }), 'Login disabled')} />
    </span>
  );
};

// ------------------------------------------------------------------------- card on a record page
interface LinkRow { id: string; user_id: string; email: string | null; full_name: string | null; created_at: string }

/** "Online account" panel for a student or a hire customer: who can sign in, and the admin controls. */
export const OnlineAccountCard: React.FC<{ studentId?: string; customerId?: string; defaults: AccountTarget }> = ({ studentId, customerId, defaults }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState<LinkRow | null>(null);
  const links = useQuery(async () => {
    let q = supabase.from('portal_links').select('id,user_id,email,full_name,created_at').is('revoked_at', null);
    q = studentId ? q.eq('student_id', studentId) : q.eq('customer_id', customerId ?? '');
    const { data, error } = await q;
    if (error) throw new Error(friendlyError(error));
    return (data ?? []) as LinkRow[];
  }, [] as LinkRow[], [studentId, customerId]);
  const statuses = useAccountStatuses(links.data.map(l => l.user_id));
  const reload = () => { links.reload(); statuses.reload(); };

  return (
    <div className="rounded-4xl border border-ink-100 bg-white p-5 sm:p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-lg font-bold text-ink-900 flex items-center gap-2"><ShieldCheck size={20} className="text-mint-600" /> Online account</h2>
        <Button size="sm" onClick={() => setOpen(true)}><UserPlus size={15} /> {links.data.length ? 'Add another login' : 'Create online account'}</Button>
      </div>
      {links.error ? <p className="text-sm text-red-600">{links.error}</p> : links.loading ? <p className="text-sm text-ink-400">Loading…</p> : links.data.length === 0
        ? <p className="text-sm text-ink-600">No online account yet. Create one so the family can sign in and see {studentId ? 'the route, fees, payments and receipts' : 'their hires, payments and receipts'}. You can email an invitation or set a password yourself.</p>
        : <ul className="divide-y divide-ink-100">{links.data.map(l => (
          <li key={l.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0"><b className="text-ink-900">{l.full_name ?? '—'}</b> <span className="text-ink-500 break-all">{l.email}</span><br /><span className="text-xs text-ink-400">Linked {format(new Date(l.created_at), 'dd MMM yyyy')}{statuses.data[l.user_id]?.last_sign_in_at ? ` · last sign-in ${format(new Date(statuses.data[l.user_id].last_sign_in_at!), 'dd MMM yyyy, HH:mm')}` : ''}</span></span>
            <span className="flex flex-wrap items-center gap-2">{statusBadge(statuses.data[l.user_id])}
              <AccountActions userId={l.user_id} email={l.email ?? ''} status={statuses.data[l.user_id]} onChanged={statuses.reload} />
              <button title="Remove this person’s access to this record" aria-label="Remove access" onClick={() => setRemove(l)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><UserX size={16} /></button></span>
          </li>))}</ul>}
      <AccountModal open={open} target={{ ...defaults, studentIds: studentId ? [studentId] : [], customerIds: customerId ? [customerId] : [] }} onClose={() => setOpen(false)} onDone={reload} />
      <ConfirmDialog open={!!remove} danger title="Remove access?" confirmLabel="Remove access" message={`${remove?.email} will immediately stop seeing this record. Their login still exists and can be linked again later.`} onClose={() => setRemove(null)}
        onConfirm={async () => { if (!remove) return; const { error } = await supabase.rpc('revoke_portal_link', { p_link: remove.id }); if (error) toast.error(friendlyError(error)); else { toast.success('Access removed'); reload(); } setRemove(null); }} />
    </div>
  );
};

// ------------------------------------------------------------------------- card on a driver
/** "Online account" panel for a driver: his own login shows him only what is assigned to him. */
export const DriverAccountCard: React.FC<{ driverId: string; defaults: AccountTarget }> = ({ driverId, defaults }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState(false);
  const link = useQuery(async () => {
    const { data, error } = await supabase.from('drivers').select('user_id').eq('id', driverId).maybeSingle();
    if (error) throw new Error(friendlyError(error));
    return (data as { user_id: string | null } | null)?.user_id ?? null;
  }, null as string | null, [driverId]);
  const uid = link.data;
  const statuses = useAccountStatuses(uid ? [uid] : []);
  const st = uid ? statuses.data[uid] : undefined;
  const reload = () => { link.reload(); statuses.reload(); };

  return (
    <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="font-display text-base font-bold text-ink-900 flex items-center gap-2"><ShieldCheck size={18} className="text-mint-600" /> Driver login</h3>
        {!uid && !link.loading && <Button size="sm" onClick={() => setOpen(true)}><UserPlus size={15} /> Create driver login</Button>}
      </div>
      {link.error ? <p className="text-sm text-red-600">{link.error}</p> : link.loading ? <p className="text-sm text-ink-400">Loading…</p> : !uid
        ? <p className="text-sm text-ink-600">No login yet. Create one so this driver can sign in and see only his own routes, students, vehicle and trips.</p>
        : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0"><b className="text-ink-900 break-all">{st?.email ?? 'Login created'}</b><br /><span className="text-xs text-ink-400">{st?.last_sign_in_at ? `Last sign-in ${format(new Date(st.last_sign_in_at), 'dd MMM yyyy, HH:mm')}` : 'Has not signed in yet'}</span></span>
            <span className="flex flex-wrap items-center gap-2">{statusBadge(st)}
              <AccountActions userId={uid} email={st?.email ?? ''} status={st} onChanged={statuses.reload} />
              <button title="Remove this driver’s login" aria-label="Remove login" onClick={() => setRemove(true)} className="p-2 rounded-full hover:bg-ink-100 text-red-500"><UserX size={16} /></button></span>
          </div>)}
      <AccountModal open={open} target={{ ...defaults, driverId }} onClose={() => setOpen(false)} onDone={reload} />
      <ConfirmDialog open={remove} danger title="Remove this login?" confirmLabel="Remove login" message={`${st?.email ?? 'This login'} will no longer be able to sign in as this driver. The driver record is kept, and you can create a new login later.`} onClose={() => setRemove(false)}
        onConfirm={async () => { try { await callPortalApi({ action: 'remove_driver_login', driver_id: driverId }); toast.success('Login removed'); reload(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not remove the login'); } setRemove(false); }} />
    </div>
  );
};
