import React, { useState } from 'react';
import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { FileSpreadsheet, FileText, Play } from 'lucide-react';
import { REPORTS, type ReportDef, type ReportResult } from '../../lib/reports';
import { cellText, exportExcel, exportPdf } from '../../lib/export';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { cn } from '../../lib/utils';
import { AdminHeader, Card } from '../../components/admin/ui';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input } from '../../components/ui/Input';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const PRESETS: [string, () => [string, string]][] = [
  ['This month', () => [ymd(startOfMonth(new Date())), ymd(endOfMonth(new Date()))]],
  ['Last month', () => [ymd(startOfMonth(subMonths(new Date(), 1))), ymd(endOfMonth(subMonths(new Date(), 1)))]],
  ['This year', () => [ymd(startOfYear(new Date())), ymd(endOfYear(new Date()))]],
  ['Last 12 months', () => [ymd(subMonths(new Date(), 12)), ymd(new Date())]],
];

const AdminReports: React.FC = () => {
  const { settings } = useSettings();
  const toast = useToast();
  const [active, setActive] = useState<ReportDef>(REPORTS[1]);
  const [from, setFrom] = useState(ymd(startOfMonth(new Date())));
  const [to, setTo] = useState(ymd(endOfMonth(new Date())));
  const [res, setRes] = useState<ReportResult | null>(null);
  const [ran, setRan] = useState<{ id: string; period: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = Array.from(new Set(REPORTS.map(r => r.group)));
  const period = active.needsRange ? `${from} to ${to}` : `As at ${to}`;

  const run = async (def: ReportDef = active) => {
    if (def.needsRange && from > to) { toast.error('The start date is after the end date.'); return; }
    setLoading(true); setError(null);
    try { const r = await def.run(from, to); setRes(r); setRan({ id: def.id, period: def.needsRange ? `${from} to ${to}` : `As at ${to}` }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Report failed'); setRes(null); }
    finally { setLoading(false); }
  };

  const choose = (def: ReportDef) => { setActive(def); setRes(null); setRan(null); setError(null); };
  const showing = res && ran?.id === active.id;

  return (
    <div>
      <AdminHeader title="Reports & Analytics" subtitle="Built from recorded transactions only · export to PDF or Excel" />
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <Card className="!p-3 lg:sticky lg:top-20 self-start max-h-[calc(100vh-7rem)] overflow-y-auto">
          {groups.map(g => (
            <div key={g} className="mb-3 last:mb-0">
              <p className="px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-400">{g}</p>
              {REPORTS.filter(r => r.group === g).map(r => (
                <button key={r.id} onClick={() => choose(r)} className={cn('w-full text-left px-3 py-2 rounded-2xl text-sm font-bold transition', active.id === r.id ? 'bg-mint-100 text-mint-700' : 'text-ink-600 hover:bg-ink-100')}>{r.title}</button>))}
            </div>))}
        </Card>

        <div className="min-w-0">
          <Card className="mb-4">
            <h2 className="font-display text-xl font-bold text-ink-900">{active.title}</h2>
            <p className="text-sm text-ink-500 mb-4">{active.description}</p>
            <div className="flex flex-wrap items-end gap-3">
              {active.needsRange && <Field label="From"><Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></Field>}
              <Field label={active.needsRange ? 'To' : 'As at'}><Input type="date" value={to} min={active.needsRange ? from : undefined} onChange={e => setTo(e.target.value)} /></Field>
              <Button onClick={() => run()} loading={loading}><Play size={16} /> Run report</Button>
              {showing && <>
                <Button variant="outline" onClick={() => exportPdf(active.title, ran!.period, res!, settings)}><FileText size={16} /> PDF</Button>
                <Button variant="outline" onClick={() => exportExcel(active.title, ran!.period, res!, settings)}><FileSpreadsheet size={16} /> Excel</Button>
              </>}
            </div>
            {active.needsRange && <div className="flex flex-wrap gap-2 mt-3">{PRESETS.map(([l, fn]) => <button key={l} onClick={() => { const [a, b] = fn(); setFrom(a); setTo(b); }} className="px-3 py-1 rounded-full text-xs font-bold border border-ink-200 text-ink-600 hover:bg-ink-100">{l}</button>)}</div>}
          </Card>

          {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={error} onRetry={() => run()} />
            : !showing ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="Choose dates and run the report" message={`Period: ${period}`} /></div>
            : res!.rows.length === 0 ? <div className="rounded-4xl bg-white border border-ink-100"><EmptyState title="No data for this period" message="There are no recorded transactions matching this report." /></div>
            : <div className="rounded-4xl border border-ink-100 bg-white shadow-soft overflow-hidden">
              <div className="px-5 py-3 border-b border-ink-100 text-xs font-bold text-ink-500">{ran!.period} · {res!.rows.length} row(s) · {settings.currency}</div>
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="bg-ink-50 text-left">{res!.columns.map(c => <th key={c.key} className={cn('px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-ink-500 whitespace-nowrap', (c.money || c.num) && 'text-right')}>{c.label}</th>)}</tr></thead>
                <tbody className="divide-y divide-ink-100">{res!.rows.map((r, i) => {
                  const heading = res!.columns.length === 2 && r[res!.columns[1].key] === null;
                  return <tr key={i} className={cn(heading && 'bg-mint-50/60 font-extrabold text-mint-800')}>{res!.columns.map(c => <td key={c.key} className={cn('px-4 py-2.5 whitespace-pre', (c.money || c.num) && 'text-right tabular-nums')}>{cellText(r[c.key] ?? null, c.money, c.num)}</td>)}</tr>;
                })}</tbody>
                {res!.totals && <tfoot><tr className="bg-mint-50 font-extrabold text-mint-800">{res!.columns.map(c => <td key={c.key} className={cn('px-4 py-3', (c.money || c.num) && 'text-right tabular-nums')}>{cellText(res!.totals![c.key] ?? null, c.money, c.num)}</td>)}</tr></tfoot>}
              </table></div>
              {res!.notes && <ul className="px-5 py-3 text-xs text-ink-500 space-y-1 border-t border-ink-100">{res!.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </div>}
        </div>
      </div>
    </div>
  );
};

export default AdminReports;
