import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Bell, BellRing, CalendarClock, CheckCheck, FileWarning, Inbox, KeyRound, UserX, Wallet, Wrench } from 'lucide-react';
import { supabase, type AppNotification } from '../../lib/supabase';
import { check, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useToast } from '../../contexts/ToastContext';
import { cn } from '../../lib/utils';
import { AdminHeader, Pager } from '../../components/admin/ui';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';

const PAGE = 20;
const ICON: Record<string, React.ElementType> = { payment_due: Wallet, payment_overdue: Wallet, customer_owes: Wallet, booking_soon: CalendarClock, no_driver: UserX, service_due: Wrench, doc_expiry: FileWarning, inquiry: Inbox };
const TONE: Record<string, string> = { payment_overdue: 'bg-red-50 text-red-500', customer_owes: 'bg-sunshine-50 text-sunshine-600', payment_due: 'bg-sunshine-50 text-sunshine-600', doc_expiry: 'bg-peach-50 text-peach-600', service_due: 'bg-peach-50 text-peach-600', no_driver: 'bg-lavender-50 text-lavender-600', booking_soon: 'bg-mint-50 text-mint-600', inquiry: 'bg-mint-50 text-mint-600' };

const AdminNotifications: React.FC = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  const list = useQuery(async () => {
    let q = supabase.from('notifications').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (unreadOnly) q = q.eq('is_read', false);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as AppNotification[], total: count ?? 0 };
  }, { rows: [] as AppNotification[], total: 0 }, [unreadOnly, page]);

  const refreshAlerts = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('generate_notifications');
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(data ? `${data} new alert(s)` : 'No new alerts'); list.reload(); window.dispatchEvent(new Event('notifications-changed'));
  };
  const markAll = async () => {
    try { check(await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)); list.reload(); window.dispatchEvent(new Event('notifications-changed')); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };
  const open = async (n: AppNotification) => {
    if (!n.is_read) { await supabase.from('notifications').update({ is_read: true }).eq('id', n.id); window.dispatchEvent(new Event('notifications-changed')); }
    if (n.link) navigate(n.link); else list.reload();
  };
  void unwrap;

  return (
    <div>
      <AdminHeader title="Notifications" subtitle="Payments, bookings, servicing and document alerts"
        actions={<><Button variant="outline" onClick={refreshAlerts} loading={busy}><BellRing size={16} /> Check for new alerts</Button><Button variant="ghost" onClick={markAll}><CheckCheck size={16} /> Mark all read</Button></>} />
      <div className="flex gap-2 mb-4">
        {[[true, 'Unread'], [false, 'All']].map(([v, l]) => <button key={String(l)} onClick={() => { setUnreadOnly(v as boolean); setPage(0); }} className={cn('px-4 py-1.5 rounded-full text-sm font-bold border-2', unreadOnly === v ? 'bg-mint-500 border-mint-500 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-100')}>{l as string}</button>)}
      </div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState icon={<Bell size={36} strokeWidth={1.5} />} title={unreadOnly ? 'You are all caught up' : 'No notifications yet'} message="Alerts are created automatically when something needs attention." /></div>
        : <>
          <ul className="space-y-2">{list.data.rows.map(n => {
            const I = ICON[n.kind] ?? KeyRound;
            return (
              <li key={n.id}><button onClick={() => open(n)} className={cn('w-full text-left flex items-start gap-4 rounded-3xl border p-4 transition hover:shadow-soft', n.is_read ? 'bg-white border-ink-100' : 'bg-white border-mint-300 shadow-soft')}>
                <span className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', TONE[n.kind] ?? 'bg-ink-100 text-ink-600')}><I size={18} /></span>
                <span className="min-w-0 flex-1"><span className={cn('block text-sm', n.is_read ? 'font-semibold text-ink-700' : 'font-extrabold text-ink-900')}>{n.title}</span>{n.body && <span className="block text-sm text-ink-500">{n.body}</span>}</span>
                <span className="text-xs font-semibold text-ink-400 whitespace-nowrap">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
              </button></li>);
          })}</ul>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
    </div>
  );
};

export default AdminNotifications;
