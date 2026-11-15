import React from 'react';
import { cn } from '../../lib/utils';

export const AdminHeader: React.FC<{ title: string; subtitle?: string; actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
    <div>
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-ink-900">{title}</h1>
      {subtitle && <p className="text-sm text-ink-500 font-semibold mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex gap-2">{actions}</div>}
  </div>
);

export const StatCard: React.FC<{ label: string; value: string; icon?: React.ReactNode; tone?: 'mint' | 'sunshine' | 'lavender' | 'peach' | 'red' | 'ink'; hint?: React.ReactNode }> = ({ label, value, icon, tone = 'mint', hint }) => {
  const tones = {
    mint: 'bg-mint-50 text-mint-600', sunshine: 'bg-sunshine-50 text-sunshine-600', lavender: 'bg-lavender-50 text-lavender-600',
    peach: 'bg-peach-50 text-peach-600', red: 'bg-red-50 text-red-500', ink: 'bg-ink-100 text-ink-600',
  };
  return (
    <div className="rounded-4xl border border-ink-100 bg-white p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink-400">{label}</p>
        <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center', tones[tone])}>{icon}</div>
      </div>
      <p className="font-display text-2xl sm:text-3xl font-extrabold text-ink-900 mt-2">{value}</p>
      {hint && <p className="text-xs text-ink-400 font-semibold mt-1">{hint}</p>}
    </div>
  );
};

export const Table: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="rounded-4xl border border-ink-100 bg-white shadow-soft overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-ink-50 text-left">
            {head.map((h, i) => <th key={i} className="px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-ink-500">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  </div>
);

export const Td: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>
);

export const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }> = ({ title, children, className, actions }) => (
  <div className={cn('rounded-4xl border border-ink-100 bg-white p-5 sm:p-6 shadow-soft', className)}>
    {(title || actions) && <div className="flex items-center justify-between mb-4"><h2 className="font-display text-lg font-bold text-ink-900">{title}</h2>{actions}</div>}
    {children}
  </div>
);

export const Pager: React.FC<{ page: number; pageSize: number; total: number; onPage: (p: number) => void }> = ({ page, pageSize, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between mt-4 text-sm font-semibold text-ink-500">
      <span>Page {page + 1} of {pages} · {total} records</span>
      <div className="flex gap-2">
        <button disabled={page === 0} onClick={() => onPage(page - 1)} className="px-4 py-1.5 rounded-full border border-ink-200 disabled:opacity-40 hover:bg-ink-100">Previous</button>
        <button disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} className="px-4 py-1.5 rounded-full border border-ink-200 disabled:opacity-40 hover:bg-ink-100">Next</button>
      </div>
    </div>
  );
};
