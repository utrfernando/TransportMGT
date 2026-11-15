import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Bus, CalendarClock, FileWarning, GraduationCap, Inbox, KeyRound, TrendingDown, TrendingUp, UserRound, Users, Wallet, Wrench } from 'lucide-react';
import { endOfDay, format, startOfDay, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { supabase, type Inquiry } from '../../lib/supabase';
import { unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { cn, formatMoney } from '../../lib/utils';
import { AdminHeader, Card, StatCard } from '../../components/admin/ui';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';

type Range = 'today' | 'week' | 'month' | 'year' | 'custom';
interface Summary {
  vehicles_total: number; vehicles_active: number; vehicles_hired_now: number; students_active: number; schools_active: number; drivers_total: number;
  income: number; expenses: number; net: number; pending_student_payments: number; overdue_student_payments: number; outstanding_hire_balances: number;
  upcoming_bookings: number; upcoming_maintenance: number; upcoming_doc_expiries: number;
  monthly: { month: string; income: number; expenses: number }[]; by_vehicle: { name: string; revenue: number }[];
  by_service: { category: string; amount: number }[]; expense_categories: { name: string; amount: number }[];
}
const EMPTY: Summary = { vehicles_total: 0, vehicles_active: 0, vehicles_hired_now: 0, students_active: 0, schools_active: 0, drivers_total: 0, income: 0, expenses: 0, net: 0, pending_student_payments: 0, overdue_student_payments: 0, outstanding_hire_balances: 0, upcoming_bookings: 0, upcoming_maintenance: 0, upcoming_doc_expiries: 0, monthly: [], by_vehicle: [], by_service: [], expense_categories: [] };
const SERVICE_LABEL: Record<string, string> = { school_transport: 'School transport', bus_hire: 'Bus hire', van_hire: 'Van hire', tuk_tuk_hire: 'Tuk Tuk hire', other: 'Other' };
const COLORS = ['#14b8a6', '#fbbf24', '#8b5cf6', '#fb923c', '#5eead4', '#a78bfa', '#f59e0b', '#0f766e'];
const INCOME = '#14b8a6', EXPENSE = '#fb923c';

const ChartCard: React.FC<{ title: string; empty: boolean; children: React.ReactNode; className?: string }> = ({ title, empty, children, className }) => (
  <Card title={title} className={className}>{empty ? <p className="text-sm text-ink-500 py-10 text-center">No data in this period yet.</p> : <div className="h-64">{children}</div>}</Card>
);

const AdminDashboard: React.FC = () => {
  const { settings } = useSettings();
  const cur = settings.currency;
  const m = (n: number) => formatMoney(n, cur);
  const [range, setRange] = useState<Range>('month');
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [customTo, setCustomTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const now = new Date();
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
  const bounds: Record<Range, [string, string]> = {
    today: [fmt(startOfDay(now)), fmt(endOfDay(now))], week: [fmt(startOfWeek(now, { weekStartsOn: 1 })), fmt(now)],
    month: [fmt(startOfMonth(now)), fmt(now)], year: [fmt(startOfYear(now)), fmt(now)], custom: [customFrom, customTo],
  };
  const [from, to] = bounds[range];
  const valid = from && to && from <= to;

  const sum = useQuery(async () => {
    if (!valid) return EMPTY;
    const { data, error } = await supabase.rpc('dashboard_summary', { p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return { ...EMPTY, ...(data as Summary) };
  }, EMPTY, [from, to, valid]);

  const recent = useQuery(async () => unwrap(await supabase.from('public_inquiries').select('*').order('created_at', { ascending: false }).limit(5)) as Inquiry[], [] as Inquiry[]);

  const s = sum.data;
  const ranges: [Range, string][] = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['custom', 'Custom']];
  const monthly = s.monthly.map(x => ({ ...x, label: format(new Date(x.month + '-01T00:00:00'), 'MMM yy'), profit: Number(x.income) - Number(x.expenses) }));
  const tip = (v: unknown) => m(Number(v));

  return (
    <div>
      <AdminHeader title="Dashboard" subtitle={`Figures come from recorded transactions · ${cur}`} />

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
        <span className="text-xs font-semibold text-ink-400 ml-auto">{from} → {to}</span>
      </div>

      {sum.error ? <ErrorState message={sum.error} onRetry={sum.reload} /> : sum.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : <>
        <div className="grid gap-4 sm:grid-cols-3 mb-4">
          <StatCard label="Cash collected" value={m(s.income)} icon={<TrendingUp size={20} />} tone="mint" hint="Payments received in period" />
          <StatCard label="Expenses" value={m(s.expenses)} icon={<TrendingDown size={20} />} tone="peach" />
          <StatCard label="Net profit" value={m(s.net)} icon={<Wallet size={20} />} tone={s.net >= 0 ? 'sunshine' : 'red'} hint="Collected − expenses" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <StatCard label="Vehicles" value={String(s.vehicles_total)} hint={`${s.vehicles_active} active`} icon={<Bus size={20} />} tone="mint" />
          <StatCard label="Currently hired" value={String(s.vehicles_hired_now)} icon={<KeyRound size={20} />} tone="lavender" hint="On a confirmed/in-progress hire now" />
          <StatCard label="Active students" value={String(s.students_active)} icon={<GraduationCap size={20} />} tone="lavender" />
          <StatCard label="Active schools" value={String(s.schools_active)} icon={<Users size={20} />} tone="sunshine" />
          <StatCard label="Drivers" value={String(s.drivers_total)} icon={<UserRound size={20} />} tone="ink" />
          <StatCard label="Pending student payments" value={m(s.pending_student_payments)} icon={<AlertTriangle size={20} />} tone={s.overdue_student_payments > 0 ? 'red' : 'sunshine'} hint={s.overdue_student_payments > 0 ? `${m(s.overdue_student_payments)} overdue` : 'Nothing overdue'} />
          <StatCard label="Outstanding hire balances" value={m(s.outstanding_hire_balances)} icon={<Wallet size={20} />} tone={s.outstanding_hire_balances > 0 ? 'sunshine' : 'ink'} />
          <StatCard label="Upcoming bookings" value={String(s.upcoming_bookings)} icon={<CalendarClock size={20} />} tone="mint" hint="Confirmed, next 30 days" />
          <StatCard label="Maintenance due" value={String(s.upcoming_maintenance)} icon={<Wrench size={20} />} tone={s.upcoming_maintenance > 0 ? 'peach' : 'ink'} hint={<Link to="/admin/maintenance" className="underline">View</Link> } />
          <StatCard label="Documents expiring" value={String(s.upcoming_doc_expiries)} icon={<FileWarning size={20} />} tone={s.upcoming_doc_expiries > 0 ? 'peach' : 'ink'} hint={<Link to="/admin/documents" className="underline">View</Link> } />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 mb-4">
          <ChartCard title="Monthly income vs expenses (12 months)" empty={monthly.every(x => !x.income && !x.expenses)}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={56} /><Tooltip formatter={tip} /><Legend />
              <Bar dataKey="income" name="Income" fill={INCOME} radius={[6, 6, 0, 0]} /><Bar dataKey="expenses" name="Expenses" fill={EXPENSE} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Monthly profit trend" empty={monthly.every(x => !x.income && !x.expenses)}>
            <ResponsiveContainer width="100%" height="100%"><LineChart data={monthly}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={56} /><Tooltip formatter={tip} />
              <Line type="monotone" dataKey="profit" name="Net profit" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Revenue by vehicle" empty={s.by_vehicle.length === 0}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={s.by_vehicle} layout="vertical" margin={{ left: 16 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} /><Tooltip formatter={tip} />
              <Bar dataKey="revenue" name="Revenue" fill={INCOME} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Revenue by service type" empty={s.by_service.length === 0}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={s.by_service.map(x => ({ name: SERVICE_LABEL[x.category] ?? x.category, value: Number(x.amount) }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
              {s.by_service.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={tip} /><Legend /></PieChart></ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Expense categories" empty={s.expense_categories.length === 0} className="lg:col-span-2">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={s.expense_categories.map(x => ({ ...x, amount: Number(x.amount) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 11 }} width={56} /><Tooltip formatter={tip} />
              <Bar dataKey="amount" name="Spent" radius={[6, 6, 0, 0]}>{s.expense_categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>
          </ChartCard>
        </div>
      </>}

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
