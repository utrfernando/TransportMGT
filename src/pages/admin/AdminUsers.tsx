import React, { useState } from 'react';
import { format } from 'date-fns';
import { supabase, type AppRole, type Profile } from '../../lib/supabase';
import { useQuery } from '../../lib/queries';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { AdminHeader, Card, Table, Td } from '../../components/admin/ui';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Select } from '../../components/ui/Input';

const AdminUsers: React.FC = () => {
  const { profile, isOwner } = useAuth();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []) as Profile[];
  }, [] as Profile[]);

  const patch = async (id: string, values: Partial<Profile>, okMsg: string) => {
    setBusy(true);
    const { error } = await supabase.from('profiles').update(values).eq('id', id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(okMsg);
    setConfirm(null);
    q.reload();
  };

  return (
    <div>
      <AdminHeader title="User Management" subtitle="Authorised administrators of this system" />
      {!isOwner && <p className="mb-4 rounded-2xl bg-sunshine-50 text-sunshine-700 text-sm font-semibold p-3">Only the business owner can change administrator accounts.</p>}
      {q.loading ? <Skeleton className="h-40" /> : q.error ? <ErrorState message={q.error} onRetry={q.reload} /> : (
        <Table head={['Name', 'Email', 'Role', 'Status', 'Added', '']}>
          {q.data.map(u => {
            const self = u.id === profile?.id;
            return (
              <tr key={u.id}>
                <Td className="font-bold">{u.full_name}{self && <span className="text-xs text-ink-400 font-semibold"> (you)</span>}</Td>
                <Td>{u.email}</Td>
                <Td>
                  {isOwner && !self
                    ? <Select className="!py-1.5 !w-32" value={u.role} onChange={e => patch(u.id, { role: e.target.value as AppRole }, 'Role updated')}><option>OWNER</option><option>ADMIN</option></Select>
                    : <Badge color={u.role === 'OWNER' ? 'sunshine' : 'mint'}>{u.role}</Badge>}
                </Td>
                <Td><Badge color={u.is_active ? 'green' : 'red'}>{u.is_active ? 'Active' : 'Deactivated'}</Badge></Td>
                <Td>{format(new Date(u.created_at), 'dd MMM yyyy')}</Td>
                <Td>{isOwner && !self && <Button size="sm" variant={u.is_active ? 'ghost' : 'outline'} onClick={() => u.is_active ? setConfirm(u) : patch(u.id, { is_active: true }, 'Account reactivated')}>{u.is_active ? 'Deactivate' : 'Reactivate'}</Button>}</Td>
              </tr>
            );
          })}
        </Table>
      )}
      <Card title="Adding an administrator" className="mt-6">
        <p className="text-sm text-ink-600">There is no public sign-up. New administrator accounts are provisioned by the owner from a trusted machine with the setup script, so the Supabase service key never reaches the browser:</p>
        <pre className="mt-3 rounded-2xl bg-ink-900 text-mint-300 text-xs p-4 overflow-x-auto">npm run create-admin -- --email name@example.com --name "Full Name" --role ADMIN</pre>
      </Card>
      <ConfirmDialog open={!!confirm} danger loading={busy} title="Deactivate account?" confirmLabel="Deactivate"
        message={`${confirm?.full_name} will immediately lose access to all business data. Their historical records are kept.`}
        onClose={() => setConfirm(null)} onConfirm={() => confirm && patch(confirm.id, { is_active: false }, 'Account deactivated')} />
    </div>
  );
};

export default AdminUsers;
