import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bus, GraduationCap, Users, UserRound, Inbox, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { startOfDay, startOfWeek, startOfMonth, startOfYear, format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { formatMoney, cn } from '../../lib/utils';
import { AdminHeader, Card, StatCard } from '../../components/admin/ui';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import type { Inquiry } from '../../lib/supabase';

type Range = 'today' | 'week' | 'month' | 'year' | 'custom';

const count = async (table: string, filter?: (q: any) => any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) throw new Error(error.message);
  return c ?? 0;
};

const sum = async (table: 'payments' | 'expenses', col: string, from: string, to: string) => {
  const { data, error } = await supabase.from(table).select('amount').gte(col, from).lte(col, to);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount), 0);
};

const AdminDashboard: React.FC = () => {
  const { settings } = useSettings();
  const [range, setRange] = useState<Range>('month');
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  const bounds: Record<Range, [string, string]> = {
    today: [fmt(startOfDay(now)), fmt(now)],
    week: [fmt(startOfWeek(now, { weekStartsOn: 1 })), fmt(now)],
    month: [fmt(startOfMonth(now)), fmt(now)],
    year: [fmt(startOfYear(now)), fmt(now)],
    custom: [customFrom, customTo],
  };
  const [from, to] = bounds[range];

  const counts = useQuery(async () => {
    const [vehicles, activeVehicles, drivers, students, schools, newInquiries] = await Promise.all([
      count('vehicles', q => q.eq('is_archived', false)),
      count('vehicles', q => q.eq('is_archived', false).eq('status', 'active')),
      count('drivers', q => q.eq('is_archived', false)),
      count('students', q => q.eq('status', 'active')),
      count('schools', q => q.eq('is_archived', false).eq('status', 'active')),
      count('public_inquiries', q => q.eq('status', 'new')),
    ]);
    return { vehicles, activeVehicles, drivers, students, schools, newInquiries };
  }, { vehicles: 0, activeVehicles: 0, drivers: 0, students: 0, schools: 0, newInquiries: 0 });

  const money = useQuery(async () => {
    const [income, expenses] = await Promise.all([sum('payments', 'payment_date', from, to), sum('expenses', 'expense_date', from, to)]);
    return { income, expenses };
  }, { income: 0, expenses: 0 }, [from, to]);

  const recent = useQuery(async () => {
    const { data, error } = await supabase.from('public_inquiries').select('*').order('created_at', { ascending: false }).limit(5);
    if (error) throw new Error(error.message);
    return (data ?? []) as Inquiry[];
  }, [] as Inquiry[]);

  const c = counts.data;
  const net = money.data.income - money.data.expenses;
  const ranges: [Range, string][] = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['custom', 'Custom']];

  return (
    <div>
      <AdminHeader title="Dashboard" subtitle={`Figures come from recorded transactions · ${settings.currency}`} />

      {counts.error && <ErrorState message={counts.error} onRetry={counts.reload} />}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {ranges.map(([k, label]) => (
          <button key={k} onClick={() => setRange(k)} className={cn('px-4 py-1.5 rounded-full text-sm font-bold border-2 transition', range === k ? 'bg-mint-500 border-mint-500 text-white' : 'border-ink-200 text-ink-600 hover:bg-ink-100')}>{label}</button>
        ))}
        {range === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)} className="rounded-xl border-2 border-ink-100 px-3 py-1.5" />
            <span>to</span>
            <input type="date" value={customTo} min={customFrom} onChange={e => setCustomTo(e.target.value)} className="rounded-xl border-2 border-ink-100 px-3 py-1.5" />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {money.loading ? [0, 1, 2].map(i => <Skeleton key={i} className="h-32" />) : <>
          <StatCard label="Cash collected" value={formatMoney(money.data.income, settings.currency)} icon={<TrendingUp size={20} />} tone="mint" hint={`${from} → ${to}`} />
          <StatCard label="Expenses" value={formatMoney(money.data.expenses, settings.currency)} icon={<TrendingDown size={20} />} tone="peach" />
          <StatCard label="Net result" value={formatMoney(net, settings.currency)} icon={<Wallet size={20} />} tone={net >= 0 ? 'sunshine' : 'red'} hint="Collected − expenses" />
        </>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        {counts.loading ? [0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32" />) : <>
          <StatCard label="Vehicles" value={String(c.vehicles)} hint={`${c.activeVehicles} active`} icon={<Bus size={20} />} tone="mint" />
          <StatCard label="Active students" value={String(c.students)} icon={<GraduationCap size={20} />} tone="lavender" />
          <StatCard label="Active schools" value={String(c.schools)} icon={<Users size={20} />} tone="sunshine" />
          <StatCard label="Drivers" value={String(c.drivers)} icon={<UserRound size={20} />} tone="ink" />
        </>}
      </div>

      <Card title="Latest inquiries" actions={<Link to="/admin/inquiries" className="text-sm font-bold text-mint-600">View all</Link>}>
        {recent.loading ? <Skeleton className="h-24" /> : recent.error ? <ErrorState message={recent.error} onRetry={recent.reload} />
          : recent.data.length === 0 ? <div className="flex items-center gap-3 text-ink-500"><Inbox size={20} /> No inquiries yet — they will appear here when visitors use the website form.</div>
          : <ul className="divide-y divide-ink-100">
            {recent.data.map(i => (
              <li key={i.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="font-bold text-ink-900 truncate">{i.customer_name} <span className="text-ink-400 font-semibold">· {i.service}</span></p><p className="text-xs text-ink-400">{i.reference} · {format(new Date(i.created_at), 'dd MMM, HH:mm')}</p></div>
                <Badge color={i.status === 'new' ? 'sunshine' : 'ink'}>{i.status.replace('_', ' ')}</Badge>
              </li>
            ))}
          </ul>}
      </Card>
    </div>
  );
};

export default AdminDashboard;
