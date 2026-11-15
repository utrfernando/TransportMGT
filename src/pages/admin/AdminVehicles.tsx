import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Eye, Pencil, Plus } from 'lucide-react';
import { supabase, type Vehicle } from '../../lib/supabase';
import { check, sanitizeSearch, unwrap } from '../../lib/db';
import { useQuery } from '../../lib/queries';
import { useToast } from '../../contexts/ToastContext';
import { AdminHeader, Pager, Table, Td } from '../../components/admin/ui';
import { ExpiryDate, SearchBox, StatusBadge } from '../../components/admin/crud';
import VehicleForm from '../../components/admin/VehicleForm';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Input';

const PAGE = 12;
export const TYPE_LABEL: Record<string, string> = { bus: 'Bus', van: 'Van', three_wheeler: 'Tuk Tuk', other: 'Other' };

const AdminVehicles: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [toArchive, setToArchive] = useState<Vehicle | null>(null);

  const list = useQuery(async () => {
    let q = supabase.from('vehicles').select('*', { count: 'exact' }).eq('is_archived', archived).order('name').range(page * PAGE, page * PAGE + PAGE - 1);
    if (type !== 'all') q = q.eq('vehicle_type', type);
    if (status !== 'all') q = q.eq('status', status);
    const s = sanitizeSearch(search);
    if (s) q = q.or(`name.ilike.%${s}%,registration_number.ilike.%${s}%,brand.ilike.%${s}%`);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data ?? []) as Vehicle[], total: count ?? 0 };
  }, { rows: [] as Vehicle[], total: 0 }, [search, type, status, archived, page]);

  const setArchivedFlag = async (v: Vehicle, flag: boolean) => {
    try {
      check(await supabase.from('vehicles').update({ is_archived: flag, ...(flag ? { status: 'inactive' } : {}) }).eq('id', v.id));
      if (flag) await supabase.from('public_vehicle_listings').update({ is_published: false }).eq('vehicle_id', v.id);
      toast.success(flag ? 'Vehicle archived — history is kept' : 'Vehicle restored');
      setToArchive(null); list.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  };
  void unwrap;

  return (
    <div>
      <AdminHeader title="Vehicle Management" subtitle="Your fleet, documents and public listings"
        actions={<Button onClick={() => setEditing('new')}><Plus size={18} /> Add vehicle</Button>} />
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchBox value={search} onChange={v => { setSearch(v); setPage(0); }} placeholder="Search name, registration or brand" />
        <Select className="w-40" value={type} onChange={e => { setType(e.target.value); setPage(0); }}><option value="all">All types</option>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select className="w-48" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All statuses</option><option value="active">Active</option><option value="under_maintenance">Under maintenance</option><option value="unavailable">Unavailable</option><option value="inactive">Inactive</option></Select>
        <label className="flex items-center gap-2 text-sm font-bold text-ink-600"><input type="checkbox" className="h-4 w-4 accent-teal-500" checked={archived} onChange={e => { setArchived(e.target.checked); setPage(0); }} /> Archived</label>
      </div>

      {list.loading ? <Skeleton className="h-64" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : list.data.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title={archived ? 'No archived vehicles' : 'No vehicles yet'} message="Add your first vehicle to start tracking hires, fuel and maintenance." actionLabel={archived ? undefined : 'Add vehicle'} onAction={() => setEditing('new')} /></div>
        : <>
          <Table head={['Vehicle', 'Type', 'Seats', 'Status', 'Insurance', 'Licence', 'Emission', '']}>
            {list.data.rows.map(v => (
              <tr key={v.id} className="hover:bg-ink-50">
                <Td><Link to={`/admin/vehicles/${v.id}`} className="font-bold text-ink-900 hover:text-mint-600">{v.name}</Link><br /><span className="text-xs text-ink-400">{v.registration_number}</span></Td>
                <Td>{TYPE_LABEL[v.vehicle_type]}</Td>
                <Td>{v.seating_capacity}</Td>
                <Td><StatusBadge status={v.status} /></Td>
                <Td><ExpiryDate date={v.insurance_expiry} /></Td>
                <Td><ExpiryDate date={v.revenue_licence_expiry} /></Td>
                <Td><ExpiryDate date={v.emission_expiry} /></Td>
                <Td className="whitespace-nowrap text-right">
                  <Link to={`/admin/vehicles/${v.id}`} title="View" className="inline-flex p-2 rounded-full hover:bg-ink-100"><Eye size={16} /></Link>
                  <button title="Edit" onClick={() => setEditing(v)} className="p-2 rounded-full hover:bg-ink-100"><Pencil size={16} /></button>
                  {archived ? <button title="Restore" onClick={() => setArchivedFlag(v, false)} className="p-2 rounded-full hover:bg-ink-100"><ArchiveRestore size={16} /></button>
                    : <button title="Archive" onClick={() => setToArchive(v)} className="p-2 rounded-full hover:bg-ink-100"><Archive size={16} /></button>}
                </Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pageSize={PAGE} total={list.data.total} onPage={setPage} />
        </>}

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add vehicle' : 'Edit vehicle'}>
        {editing && <VehicleForm vehicle={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); list.reload(); }} />}
      </Modal>
      <ConfirmDialog open={!!toArchive} title="Archive vehicle?" confirmLabel="Archive"
        message={`${toArchive?.name} will be hidden from lists and the website. All hire, income, expense and fuel history is kept.`}
        onClose={() => setToArchive(null)} onConfirm={() => toArchive && setArchivedFlag(toArchive, true)} />
    </div>
  );
};

export default AdminVehicles;
