import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { daysUntil } from '../../lib/db';
import { format } from 'date-fns';

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder }) => (
  <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[220px]">
    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
    <Input className="pl-10" placeholder={placeholder ?? 'Search…'} value={value} onChange={e => onChange(e.target.value)} />
  </div>
);

const STATUS_TONE: Record<string, 'green' | 'sunshine' | 'ink' | 'red' | 'lavender' | 'mint' | 'peach'> = {
  active: 'green', under_maintenance: 'sunshine', unavailable: 'peach', inactive: 'ink', paused: 'sunshine',
  completed: 'mint', withdrawn: 'red', on_leave: 'sunshine',
};
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <Badge color={STATUS_TONE[status] ?? 'ink'}>{status.replace(/_/g, ' ')}</Badge>
);

/** Colour-coded expiry date (red = expired, amber = within 30 days). */
export const ExpiryDate: React.FC<{ date?: string | null; warnDays?: number }> = ({ date, warnDays = 30 }) => {
  if (!date) return <span className="text-ink-300">—</span>;
  const d = daysUntil(date)!;
  const cls = d < 0 ? 'text-red-600 font-bold' : d <= warnDays ? 'text-sunshine-700 font-bold' : 'text-ink-700';
  return <span className={cls} title={d < 0 ? `Expired ${-d} days ago` : `${d} days left`}>{format(new Date(date + 'T00:00:00'), 'dd MMM yyyy')}</span>;
};

export const Tabs: React.FC<{ tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }> = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 overflow-x-auto border-b border-ink-100 mb-5">
    {tabs.map(t => (
      <button key={t.key} onClick={() => onChange(t.key)}
        className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition ${active === t.key ? 'border-mint-500 text-mint-700' : 'border-transparent text-ink-500 hover:text-ink-800'}`}>{t.label}</button>
    ))}
  </div>
);

export const KV: React.FC<{ items: [string, React.ReactNode][] }> = ({ items }) => (
  <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
    {items.map(([k, v]) => (
      <div key={k}><dt className="text-xs font-extrabold uppercase text-ink-400">{k}</dt><dd className="font-semibold text-ink-900 break-words">{v ?? '—'}</dd></div>
    ))}
  </dl>
);

export const FormActions: React.FC<{ onCancel: () => void; saving: boolean; label?: string }> = ({ onCancel, saving, label = 'Save' }) => (
  <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white py-3">
    <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-full font-bold text-ink-700 hover:bg-ink-100">Cancel</button>
    <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-full font-bold bg-mint-500 text-white hover:bg-mint-600 disabled:opacity-50 shadow-soft">{saving ? 'Saving…' : label}</button>
  </div>
);
