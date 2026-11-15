import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Check, Copy, KeyRound, MessageCircle, Plus, UserPlus, UserX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyError, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { whatsappLink } from '../../lib/utils';
import { AdminHeader, Card, Table, Td } from '../../components/admin/ui';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { AccountActions, AccountModal, DriverAccountsList, statusBadge, useAccountStatuses, type AccountTarget } from '../../components/admin/PortalAccounts';

interface Stu { id: string; full_name: string; student_code: string; guardian_name: string; guardian_phone: string; status: string }
interface Cus { id: string; full_name: string; phone: string }
interface Link { id: string; user_id: string; email: string | null; full_name: string | null; created_at: string; revoked_at: string | null; student_id: string | null; customer_id: string | null }
interface Invite { id: string; label: string | null; student_ids: string[]; customer_ids: string[]; expires_at: string; used_at: string | null; revoked_at: string | null; created_at: string }
const digits = (p: string) => p.replace(/\D/g, '');

const NewCodeModal: React.FC<{ open: boolean; students: Stu[]; customers: Cus[]; preStudent?: string; preCustomer?: string; onClose: () => void; onCreated: () => void }> = ({ open, students, customers, preStudent, preCustomer, onClose, onCreated }) => {
  const toast = useToast();
  const { settings } = useSettings();
  const [selS, setSelS] = useState<string[]>([]);
  const [selC, setSelC] = useState<string[]>([]);
  const [days, setDays] = useState('14');
  const [label, setLabel] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null); setCopied(false); setQ(''); setLabel('');
    // pre-select the student plus any brothers/sisters who share the same guardian phone number
    const s = students.find(x => x.id === preStudent);
    setSelS(s ? students.filter(x => digits(x.guardian_phone) === digits(s.guardian_phone) && x.status === 'active').map(x => x.id).concat(s.status === 'active' ? [] : [s.id]) : []);
    setSelC(preCustomer ? [preCustomer] : []);
  }, [open, preStudent, preCustomer, students]);

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  const needle = q.trim().toLowerCase();
  const sList = students.filter(s => !needle || `${s.full_name} ${s.student_code} ${s.guardian_name} ${s.guardian_phone}`.toLowerCase().includes(needle)).slice(0, 40);
  const cList = customers.filter(c => !needle || `${c.full_name} ${c.phone}`.toLowerCase().includes(needle)).slice(0, 40);

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_portal_invite', { p_students: selS, p_customers: selC, p_days: Number(days), p_label: label || null });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    const r = data as { code: string; expires_at: string };
    setResult({ code: r.code, expires: format(new Date(r.expires_at), 'dd MMM yyyy') });
    onCreated();
  };

  const firstStudent = students.find(s => s.id === selS[0]);
  const phone = firstStudent?.guardian_phone ?? customers.find(c => c.id === selC[0])?.phone ?? null;
  const who = firstStudent?.guardian_name ?? customers.find(c => c.id === selC[0])?.full_name ?? '';
  const message = result ? `Hello ${who}, your ${settings.business_name} account access code is ${result.code}\n\n1. Go to ${window.location.origin}/account/register and create your account (use a real email — you will get a confirmation link).\n2. Sign in and enter this code on your account page.\n\nThe code works once and expires on ${result.expires}. Please don't share it.` : '';
  const wa = result && phone ? whatsappLink(phone, message) : null;

  return (
    <Modal open={open} onClose={onClose} wide title={result ? 'Access code ready' : 'New portal access code'}>
      {result ? (
        <div className="space-y-5 text-center">
          <p className="text-sm text-ink-600">Give this code to <b>{who || 'the customer'}</b>. <b className="text-red-600">It is shown only once</b> — we store only a scrambled version, so if it is lost, create a new one.</p>
          <p className="font-display text-4xl font-extrabold tracking-[0.2em] text-ink-900 bg-mint-50 rounded-3xl py-5 select-all">{result.code}</p>
          <p className="text-sm text-ink-500">Works once · expires {result.expires}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={async () => { await navigator.clipboard.writeText(message); setCopied(true); }}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy message'}</Button>
            {wa && <a href={wa} target="_blank" rel="noreferrer"><Button variant="outline"><MessageCircle size={16} /> Send on WhatsApp</Button></a>}
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-ink-600">Choose what this person may see online. The code can be used once, by one signed-in account, and links only the records you tick.</p>
          <Input placeholder="Search students, guardians, customers…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
          <div className="grid md:grid-cols-2 gap-4">
            <div><p className="text-xs font-extrabold uppercase text-ink-400 mb-2">Students (school transport)</p>
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-ink-100 divide-y divide-ink-100">{sList.length === 0 ? <p className="p-3 text-sm text-ink-400">No students found.</p> : sList.map(s => (
                <label key={s.id} className="flex items-start gap-3 p-3 text-sm cursor-pointer hover:bg-ink-50"><input type="checkbox" className="mt-1 h-4 w-4 accent-teal-500" checked={selS.includes(s.id)} onChange={() => toggle(selS, setSelS, s.id)} /><span><b>{s.full_name}</b> <span className="text-ink-400">{s.student_code}</span><br /><span className="text-xs text-ink-500">Guardian: {s.guardian_name} · {s.guardian_phone}</span></span></label>))}</div></div>
            <div><p className="text-xs font-extrabold uppercase text-ink-400 mb-2">Customers (hires)</p>
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-ink-100 divide-y divide-ink-100">{cList.length === 0 ? <p className="p-3 text-sm text-ink-400">No customers found.</p> : cList.map(c => (
                <label key={c.id} className="flex items-start gap-3 p-3 text-sm cursor-pointer hover:bg-ink-50"><input type="checkbox" className="mt-1 h-4 w-4 accent-teal-500" checked={selC.includes(c.id)} onChange={() => toggle(selC, setSelC, c.id)} /><span><b>{c.full_name}</b><br /><span className="text-xs text-ink-500">{c.phone}</span></span></label>))}</div></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Valid for"><Select value={days} onChange={e => setDays(e.target.value)}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></Select></Field>
            <Field label="Note for yourself (optional)"><Input value={label} maxLength={80} onChange={e => setLabel(e.target.value)} placeholder="e.g. Perera family" /></Field>
          </div>
          <p className="text-xs text-ink-500">Only give the code to the child’s parent/guardian (or the customer) you have verified yourself — for example by phone. Anyone holding the code can see these records.</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={create} loading={busy} disabled={selS.length + selC.length === 0}><KeyRound size={16} /> Create code ({selS.length + selC.length})</Button></div>
        </div>
      )}
    </Modal>
  );
};

/** Step 1 of "Create online account": choose the student (brothers/sisters with the same guardian phone come too) or the customer. */
const AccountPicker: React.FC<{ open: boolean; students: Stu[]; customers: Cus[]; onClose: () => void; onPick: (t: AccountTarget) => void }> = ({ open, students, customers, onClose, onPick }) => {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const needle = q.trim().toLowerCase();
  const s = students.filter(x => x.status === 'active' && (!needle || `${x.full_name} ${x.student_code} ${x.guardian_name} ${x.guardian_phone}`.toLowerCase().includes(needle))).slice(0, 30);
  const c = customers.filter(x => !needle || `${x.full_name} ${x.phone}`.toLowerCase().includes(needle)).slice(0, 30);
  return (
    <Modal open={open} onClose={onClose} wide title="Create online account — who is it for?">
      <div className="space-y-4">
        <Input placeholder="Search a student, guardian or customer…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
        <div className="grid md:grid-cols-2 gap-4">
          <div><p className="text-xs font-extrabold uppercase text-ink-400 mb-2">Students</p><div className="max-h-64 overflow-y-auto rounded-2xl border border-ink-100 divide-y divide-ink-100">{s.length === 0 ? <p className="p-3 text-sm text-ink-400">No students found.</p> : s.map(x => (
            <button key={x.id} className="w-full text-left p-3 text-sm hover:bg-ink-50" onClick={() => { const sib = students.filter(y => y.status === 'active' && digits(y.guardian_phone) === digits(x.guardian_phone)); onPick({ studentIds: sib.map(y => y.id), name: x.guardian_name, phone: x.guardian_phone, email: '', label: sib.map(y => y.full_name).join(', ') }); }}><b>{x.full_name}</b> <span className="text-ink-400">{x.student_code}</span><br /><span className="text-xs text-ink-500">Guardian: {x.guardian_name} · {x.guardian_phone}</span></button>))}</div></div>
          <div><p className="text-xs font-extrabold uppercase text-ink-400 mb-2">Customers (hires)</p><div className="max-h-64 overflow-y-auto rounded-2xl border border-ink-100 divide-y divide-ink-100">{c.length === 0 ? <p className="p-3 text-sm text-ink-400">No customers found.</p> : c.map(x => (
            <button key={x.id} className="w-full text-left p-3 text-sm hover:bg-ink-50" onClick={() => onPick({ customerIds: [x.id], name: x.full_name, phone: x.phone, email: '', label: x.full_name })}><b>{x.full_name}</b><br /><span className="text-xs text-ink-500">{x.phone}</span></button>))}</div></div>
        </div>
        <p className="text-xs text-ink-500">Tip: you can also create the account while adding a student, or from the student or customer page.</p>
      </div>
    </Modal>
  );
};

const AdminPortal: React.FC = () => {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [acct, setAcct] = useState<AccountTarget | null>(null);
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(!!(params.get('student') || params.get('customer')));
  const [revokeLink, setRevokeLink] = useState<Link | null>(null);
  const [revokeInvite, setRevokeInvite] = useState<Invite | null>(null);

  const data = useQuery(async () => {
    const [s, c, l, i] = await Promise.all([
      supabase.from('students').select('id,full_name,student_code,guardian_name,guardian_phone,status').order('full_name'),
      supabase.from('customers').select('id,full_name,phone').eq('is_archived', false).order('full_name'),
      supabase.from('portal_links').select('id,user_id,email,full_name,created_at,revoked_at,student_id,customer_id').order('created_at', { ascending: false }),
      supabase.from('portal_invites').select('id,label,student_ids,customer_ids,expires_at,used_at,revoked_at,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    return { students: unwrap(s) as Stu[], customers: unwrap(c) as Cus[], links: unwrap(l) as Link[], invites: unwrap(i) as Invite[] };
  }, { students: [] as Stu[], customers: [] as Cus[], links: [] as Link[], invites: [] as Invite[] });

  const groups = useMemo(() => {
    const m = new Map<string, { user_id: string; email: string | null; name: string | null; links: Link[] }>();
    data.data.links.filter(l => !l.revoked_at).forEach(l => { const g = m.get(l.user_id) ?? { user_id: l.user_id, email: l.email, name: l.full_name, links: [] }; g.links.push(l); m.set(l.user_id, g); });
    return [...m.values()];
  }, [data.data.links]);
  const statuses = useAccountStatuses(groups.map(g => g.user_id));
  const sName = useMemo(() => Object.fromEntries(data.data.students.map(s => [s.id, s.full_name])), [data.data.students]);
  const cName = useMemo(() => Object.fromEntries(data.data.customers.map(c => [c.id, c.full_name])), [data.data.customers]);
  const target = (l: Link) => (l.student_id ? `Student: ${sName[l.student_id] ?? '—'}` : `Customer: ${cName[l.customer_id ?? ''] ?? '—'}`);
  const inviteTargets = (i: Invite) => [...i.student_ids.map(x => sName[x] ?? '—'), ...i.customer_ids.map(x => cName[x] ?? '—')].join(', ');
  const inviteState = (i: Invite) => i.used_at ? 'used' : i.revoked_at ? 'revoked' : new Date(i.expires_at) < new Date() ? 'expired' : 'waiting';
  const close = () => { setOpen(false); if (params.get('student') || params.get('customer')) setParams({}, { replace: true }); };

  const doRevoke = async (rpc: 'revoke_portal_link' | 'revoke_portal_invite', arg: Record<string, string>, done: () => void) => {
    const { error } = await supabase.rpc(rpc, arg);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(rpc === 'revoke_portal_link' ? 'Access removed — that person can no longer see these records' : 'Code cancelled'); done(); data.reload();
  };

  return (
    <div>
      <AdminHeader title="Portal Access" subtitle="Let parents and customers sign in and see only their own records" actions={<><Button onClick={() => setPicking(true)}><UserPlus size={18} /> Create online account</Button><Button variant="outline" onClick={() => setOpen(true)}><Plus size={18} /> Access code</Button></>} />
      <Card className="mb-6" title="How it works">
        <ol className="list-decimal pl-5 space-y-1 text-sm text-ink-600">
          <li><b>Create online account</b> for a student's family (or a hire customer): enter their email, then either <b>email them an invitation</b> to choose their own password, or <b>set a password</b> yourself and tell them. Do this when you add a student, from the student's page, or here.</li>
          <li>The login is linked to that student (or customer) automatically. They sign in at <b>/account</b> and see only their own route and timings, fees, payments, receipts and hires.</li>
          <li>You can later email a reset link, set a new password, disable the login, or remove access to a record.</li>
          <li><b>Access codes</b> are the alternative for people who sign up themselves: you give them a one-time code and they link their own account.</li>
        </ol>
      </Card>

      {data.loading ? <Skeleton className="h-48" /> : data.error ? <ErrorState message={data.error} onRetry={data.reload} /> : <>
        <h2 className="font-display text-lg font-bold text-ink-900 mb-3">Online accounts</h2>
        {groups.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100 mb-8"><EmptyState icon={<KeyRound size={36} strokeWidth={1.5} />} title="No online accounts yet" message="Create an account for a student's family or a hire customer so they can sign in." actionLabel="Create online account" onAction={() => setPicking(true)} /></div> : (
          <div className="mb-8 space-y-3">{groups.map(g => (
            <div key={g.user_id} className="rounded-3xl border border-ink-100 bg-white p-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><b className="text-ink-900">{g.name ?? '—'}</b> <span className="text-ink-500 break-all">{g.email}</span></div>{statusBadge(statuses.data[g.user_id])}</div>
              <p className="text-xs text-ink-400 mt-0.5">{statuses.data[g.user_id]?.last_sign_in_at ? `Last sign-in ${format(new Date(statuses.data[g.user_id].last_sign_in_at!), 'dd MMM yyyy, HH:mm')}` : 'Has not signed in yet'}</p>
              <ul className="mt-2 flex flex-wrap gap-2">{g.links.map(l => <li key={l.id} className="inline-flex items-center gap-1 rounded-full bg-mint-50 text-mint-800 text-xs font-bold pl-3 pr-1 py-1">{target(l)}<button aria-label={`Remove access to ${target(l)}`} title="Remove access to this record" onClick={() => setRevokeLink(l)} className="p-1 rounded-full hover:bg-mint-100 text-red-500"><UserX size={13} /></button></li>)}</ul>
              <div className="mt-2 -ml-2"><AccountActions userId={g.user_id} email={g.email ?? ''} status={statuses.data[g.user_id]} onChanged={statuses.reload} /></div>
            </div>))}</div>)}

        <DriverAccountsList />

        <h2 className="font-display text-lg font-bold text-ink-900 mb-3">Access codes issued</h2>
        {data.data.invites.length === 0 ? <p className="text-sm text-ink-500">No codes issued yet.</p> : (
          <Table head={['For', 'Note', 'Created', 'Expires', 'Status', '']}>
            {data.data.invites.map(i => { const st = inviteState(i); return (
              <tr key={i.id}><Td className="font-bold max-w-[260px] truncate">{inviteTargets(i)}</Td><Td>{i.label ?? '—'}</Td><Td>{format(new Date(i.created_at), 'dd MMM yyyy')}</Td><Td>{format(new Date(i.expires_at), 'dd MMM yyyy')}</Td>
                <Td><Badge color={st === 'waiting' ? 'sunshine' : st === 'used' ? 'green' : 'ink'}>{st === 'waiting' ? 'Not used yet' : st[0].toUpperCase() + st.slice(1)}</Badge></Td>
                <Td className="text-right">{st === 'waiting' && <Button size="sm" variant="ghost" onClick={() => setRevokeInvite(i)}>Cancel code</Button>}</Td></tr>); })}
          </Table>)}
      </>}

      <AccountPicker open={picking} students={data.data.students} customers={data.data.customers} onClose={() => setPicking(false)} onPick={t => { setPicking(false); setAcct(t); }} />
      <AccountModal open={!!acct} target={acct ?? {}} onClose={() => setAcct(null)} onDone={() => { data.reload(); statuses.reload(); }} />
      <NewCodeModal open={open} students={data.data.students} customers={data.data.customers} preStudent={params.get('student') ?? undefined} preCustomer={params.get('customer') ?? undefined} onClose={close} onCreated={data.reload} />
      <ConfirmDialog open={!!revokeLink} danger title="Remove access?" confirmLabel="Remove access" message={`${revokeLink?.full_name ?? revokeLink?.email} will immediately stop seeing ${revokeLink ? target(revokeLink) : ''}. Their account stays, and you can issue a new code later.`} onClose={() => setRevokeLink(null)} onConfirm={() => revokeLink && doRevoke('revoke_portal_link', { p_link: revokeLink.id }, () => setRevokeLink(null))} />
      <ConfirmDialog open={!!revokeInvite} danger title="Cancel this code?" confirmLabel="Cancel code" message="The code will stop working. Anyone who already used a different code keeps their access." onClose={() => setRevokeInvite(null)} onConfirm={() => revokeInvite && doRevoke('revoke_portal_invite', { p_invite: revokeInvite.id }, () => setRevokeInvite(null))} />
    </div>
  );
};

void addDays;
export default AdminPortal;
