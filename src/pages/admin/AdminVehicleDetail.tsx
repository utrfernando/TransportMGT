import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { supabase, type Vehicle } from '../../lib/supabase';
import { unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useSettings } from '../../contexts/SettingsContext';
import { formatMoney } from '../../lib/utils';
import { AdminHeader, Card, StatCard, Table, Td } from '../../components/admin/ui';
import { ExpiryDate, KV, StatusBadge, Tabs } from '../../components/admin/crud';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { TYPE_LABEL } from './AdminVehicles';

const TABS = [
  { key: 'overview', label: 'Overview' }, { key: 'hires', label: 'Hire history' }, { key: 'routes', label: 'School assignments' },
  { key: 'income', label: 'Income' }, { key: 'expenses', label: 'Expenses' }, { key: 'fuel', label: 'Fuel' },
  { key: 'maintenance', label: 'Maintenance' }, { key: 'documents', label: 'Documents' },
];

const d = (v?: string | null) => (v ? format(new Date(v.length > 10 ? v : v + 'T00:00:00'), 'dd MMM yyyy') : '—');

// Generic read-only list for a vehicle-scoped table
function Rows<T extends { id: string }>({ load, head, row, empty }: { load: () => Promise<T[]>; head: string[]; row: (r: T) => React.ReactNode[]; empty: string }) {
  const q = useQuery(load, [] as T[]);
  if (q.loading) return <Skeleton className="h-32" />;
  if (q.error) return <ErrorState message={q.error} onRetry={q.reload} />;
  if (q.data.length === 0) return <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title={empty} /></div>;
  return <Table head={head}>{q.data.map(r => <tr key={r.id}>{row(r).map((c, i) => <Td key={i}>{c}</Td>)}</tr>)}</Table>;
}

const AdminVehicleDetail: React.FC = () => {
  const { id = '' } = useParams();
  const { settings } = useSettings();
  const [tab, setTab] = useState('overview');
  const cur = settings.currency;
  const m = (n: number | string) => formatMoney(n, cur);

  const v = useQuery(async () => unwrap(await supabase.from('vehicles').select('*').eq('id', id).single()) as Vehicle, null as Vehicle | null, [id]);

  // vehicle-wise financials come from recorded transactions only
  const fin = useQuery(async () => {
    const [p, e] = await Promise.all([
      supabase.from('payments').select('amount').eq('vehicle_id', id),
      supabase.from('expenses').select('amount').eq('vehicle_id', id),
    ]);
    const sum = (r: { data: { amount: number }[] | null }) => (r.data ?? []).reduce((s, x) => s + Number(x.amount), 0);
    return { revenue: sum(p), expenses: sum(e) };
  }, { revenue: 0, expenses: 0 }, [id]);

  if (v.loading) return <Skeleton className="h-64" />;
  if (v.error || !v.data) return <ErrorState message={v.error ?? 'Vehicle not found'} />;
  const x = v.data;

  return (
    <div>
      <Link to="/admin/vehicles" className="inline-flex items-center gap-1 text-sm font-bold text-ink-500 hover:text-mint-600 mb-3"><ArrowLeft size={14} /> All vehicles</Link>
      <AdminHeader title={x.name} subtitle={`${TYPE_LABEL[x.vehicle_type]} · ${x.registration_number}${x.is_archived ? ' · Archived' : ''}`} actions={<StatusBadge status={x.status} />} />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Revenue" value={m(fin.data.revenue)} tone="mint" />
            <StatCard label="Expenses" value={m(fin.data.expenses)} tone="peach" />
            <StatCard label="Net contribution" value={m(fin.data.revenue - fin.data.expenses)} tone={fin.data.revenue - fin.data.expenses >= 0 ? 'sunshine' : 'red'} />
          </div>
          <Card title="Details">
            <KV items={[
              ['Brand / model', [x.brand, x.model].filter(Boolean).join(' ') || null], ['Year', x.manufacturing_year], ['Seats', x.seating_capacity],
              ['Fuel', x.fuel_type], ['Tank capacity', x.fuel_tank_capacity ? `${x.fuel_tank_capacity} L` : null], ['Odometer', `${Number(x.odometer_km).toLocaleString()} km`],
              ['Ownership', x.ownership_info], ['Insurance expiry', <ExpiryDate date={x.insurance_expiry} />],
              ['Revenue licence expiry', <ExpiryDate date={x.revenue_licence_expiry} />], ['Emission expiry', <ExpiryDate date={x.emission_expiry} />],
              ['Notes', x.notes],
            ]} />
          </Card>
        </div>
      )}

      {tab === 'hires' && <Rows empty="No hire bookings yet" head={['Reference', 'Customer', 'Date', 'Status', 'Price']}
        load={async () => unwrap(await supabase.from('hire_bookings').select('id,reference,start_at,status,agreed_price,customers(full_name)').eq('vehicle_id', id).order('start_at', { ascending: false })) as never[]}
        row={(r: any) => [r.reference, r.customers?.full_name, d(r.start_at), <StatusBadge status={r.status} />, m(r.agreed_price)]} />}

      {tab === 'routes' && <Rows empty="No school routes use this vehicle" head={['Route', 'School', 'Days', 'Departs', 'Returns', 'Status']}
        load={async () => unwrap(await supabase.from('transport_routes').select('id,name,operating_days,departure_time,return_time,status,schools(name)').eq('vehicle_id', id)) as never[]}
        row={(r: any) => [r.name, r.schools?.name ?? '—', (r.operating_days as number[]).map(n => 'SMTWTFS'[n]).join(' '), r.departure_time.slice(0, 5), r.return_time.slice(0, 5), <StatusBadge status={r.status} />]} />}

      {tab === 'income' && <Rows empty="No income recorded for this vehicle" head={['Reference', 'Date', 'Category', 'Method', 'Amount']}
        load={async () => unwrap(await supabase.from('payments').select('id,reference,payment_date,category,method,amount').eq('vehicle_id', id).order('payment_date', { ascending: false })) as never[]}
        row={(r: any) => [r.reference, d(r.payment_date), String(r.category).replace(/_/g, ' '), r.method.replace('_', ' '), m(r.amount)]} />}

      {tab === 'expenses' && <Rows empty="No expenses recorded for this vehicle" head={['Reference', 'Date', 'Category', 'Description', 'Amount']}
        load={async () => unwrap(await supabase.from('expenses').select('id,reference,expense_date,description,amount,expense_categories(name)').eq('vehicle_id', id).order('expense_date', { ascending: false })) as never[]}
        row={(r: any) => [r.reference, d(r.expense_date), r.expense_categories?.name, r.description, m(r.amount)]} />}

      {tab === 'fuel' && <Rows empty="No fuel records yet" head={['Date', 'Fuel', 'Litres', 'Cost', 'Odometer', 'Station']}
        load={async () => unwrap(await supabase.from('fuel_records').select('*').eq('vehicle_id', id).order('fuel_date', { ascending: false })) as never[]}
        row={(r: any) => [d(r.fuel_date), r.fuel_type, r.litres, m(r.total_cost), r.odometer_km ?? '—', r.fuel_station ?? '—']} />}

      {tab === 'maintenance' && <Rows empty="No maintenance history yet" head={['Date', 'Type', 'Description', 'Provider', 'Cost', 'Next service']}
        load={async () => unwrap(await supabase.from('vehicle_maintenance').select('*').eq('vehicle_id', id).order('service_date', { ascending: false })) as never[]}
        row={(r: any) => [d(r.service_date), String(r.category).replace(/_/g, ' '), r.description ?? '—', r.service_provider ?? '—', m(r.cost), d(r.next_service_date)]} />}

      {tab === 'documents' && <Rows empty="No documents uploaded yet" head={['Type', 'Title', 'Issued', 'Expires', 'Renewal']}
        load={async () => unwrap(await supabase.from('vehicle_documents').select('*').eq('vehicle_id', id).order('expiry_date')) as never[]}
        row={(r: any) => [String(r.doc_type).replace(/_/g, ' '), r.title, d(r.issue_date), <ExpiryDate date={r.expiry_date} />, <StatusBadge status={r.renewal_status} />]} />}
    </div>
  );
};

export default AdminVehicleDetail;
