import React, { useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { AdminHeader, Pager, Table, Td } from '../../components/admin/ui';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';

const PAGE = 20;
interface Row { id: number; user_id: string | null; table_name: string; record_id: string | null; action: string; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; created_at: string }
const TABLES = ['payments', 'invoices', 'expenses', 'hire_bookings', 'vehicles', 'drivers', 'students', 'schools', 'customers', 'transport_routes', 'fuel_records', 'vehicle_maintenance', 'vehicle_documents', 'booking_driver_assignments', 'business_settings', 'profiles', 'services', 'website_content'];
const TONE = { INSERT: 'green', UPDATE: 'sunshine', DELETE: 'red' } as const;

const changed = (r: Row) => {
  if (r.action !== 'UPDATE' || !r.old_data || !r.new_data) return [] as [string, unknown, unknown][];
  return Object.keys(r.new_data).filter(k => !['updated_at'].includes(k) && JSON.stringify(r.old_data![k]) !== JSON.stringify(r.new_data![k])).map(k => [k, r.old_data![k], r.new_data![k]] as [string, unknown, unknown]);
};

const AdminAudit: React.FC = () => {
  const [table, setTable] = useState('all');
  const [action, setAction] = useState('all');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Row | null>(null);

  const names = useQuery(async () => Object.fromEntries((unwrap(await supabase.from('profiles').select('id,full_name')) as { id: string; full_name: string }[]).map(p => [p.id, p.full_name])), {} as Record<string, string>);
  const list = useQuery(async () => {
    let q = supabase.from('audit_logs').select('*', { count: 'exact' }).order('id', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (table !== 'all') q = q.eq('table_name', table);
    if (action !== 'all') q = q.eq('action', action);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Row[], total: count ?? 0 };
  }, { rows: [] as Row[], total: 0 }, [table, action, page]);

  return (
    <div>
      <AdminHeader title="Audit Log" subtitle="Who changed what, and when. Entries cannot be edited or deleted from the app." />
      <div className="flex flex-wrap gap-3 mb-4">
        <Field label="Record type" className="w-56"><Select value={table} onChange={e => { setTable(e.target.value); setPage(0); }}><option value="all">All</option>{TABLES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Select></Field>
        <Field label="Action" className="w-40"><Select value={action} onChange={e => { setAction(e.target.value); setPage(0); }}><option value="all">All</option><option value="INSERT">Created</option><option value="UPDATE">Changed</option><option value="DELETE">Deleted</option></Select></Field>
      </div>
      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No audit entries" /></div>
        : <>
          <Table head={['When', 'Who', 'Record', 'Action', 'Details']}>
            {list.data.rows.map(r => (
              <tr key={r.id} className="hover:bg-ink-50 cursor-pointer" onClick={() => setOpen(r)}>
                <Td className="whitespace-nowrap">{format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}</Td>
                <Td>{r.user_id ? names.data[r.user_id] ?? 'Unknown user' : <span className="text-ink-400">System</span>}</Td>
                <Td className="capitalize">{r.table_name.replace(/_/g, ' ')}</Td>
                <Td><Badge color={TONE[r.action as keyof typeof TONE] ?? 'ink'}>{r.action === 'INSERT' ? 'created' : r.action === 'UPDATE' ? 'changed' : 'deleted'}</Badge></Td>
                <Td className="text-ink-500 max-w-[280px] truncate">{r.action === 'UPDATE' ? changed(r).map(c => c[0]).join(', ') || '—' : ((r.new_data ?? r.old_data)?.reference as string) ?? ((r.new_data ?? r.old_data)?.name as string) ?? ((r.new_data ?? r.old_data)?.full_name as string) ?? ''}</Td>
              </tr>))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}
      <Modal open={!!open} onClose={() => setOpen(null)} wide title={open ? `${open.action.toLowerCase()} · ${open.table_name.replace(/_/g, ' ')}` : ''}>
        {open && <div className="space-y-4 text-sm">
          <p className="text-ink-500">{format(new Date(open.created_at), 'dd MMM yyyy, HH:mm:ss')} · {open.user_id ? names.data[open.user_id] ?? 'Unknown user' : 'System'}</p>
          {open.action === 'UPDATE' ? <table className="w-full text-left"><thead><tr className="text-xs font-extrabold uppercase text-ink-400"><th className="py-1">Field</th><th>Before</th><th>After</th></tr></thead>
            <tbody>{changed(open).map(([k, a, b]) => <tr key={k} className="border-t border-ink-100 align-top"><td className="py-1.5 font-bold">{k}</td><td className="text-red-600 break-all">{String(a ?? '—')}</td><td className="text-mint-700 break-all">{String(b ?? '—')}</td></tr>)}</tbody></table>
            : <pre className="rounded-2xl bg-ink-50 p-3 text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(open.new_data ?? open.old_data, null, 2)}</pre>}
        </div>}
      </Modal>
    </div>
  );
};

export default AdminAudit;
