import { supabase } from './supabase';

export type Cell = string | number | null;
export interface Col { key: string; label: string; money?: boolean; num?: boolean }
export interface ReportResult {
  columns: Col[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  notes?: string[];
}
export interface ReportDef {
  id: string; title: string; group: string; description: string; needsRange: boolean;
  run: (from: string, to: string) => Promise<ReportResult>;
}

type Err = { message: string } | null;
const fail = (e: Err) => { if (e) throw new Error(e.message); };

/** Reads every row of a query, 1000 at a time, so large datasets are never silently truncated. */
async function fetchAll<T>(page: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: Err }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await page(a, a + 999);
    fail(error);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const n = (v: unknown) => Number(v ?? 0);
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0);
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const INCOME_CATS: [string, string][] = [['school_transport', 'School transport'], ['bus_hire', 'Bus hire'], ['van_hire', 'Van hire'], ['tuk_tuk_hire', 'Tuk Tuk hire'], ['other', 'Other']];
const pretty = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// ---------------------------------------------------------------- cash by period
async function cashByPeriod(kind: 'income' | 'expense', group: 'day' | 'month' | 'year', from: string, to: string): Promise<ReportResult> {
  const { data, error } = await supabase.rpc('rpt_cash_matrix', { p_kind: kind, p_group: group, p_from: from, p_to: to });
  fail(error);
  const rows = (data ?? []) as { period: string; category: string; entries: number; total: number }[];
  const cats = kind === 'income'
    ? INCOME_CATS.map(([k, l]) => ({ key: k, label: l }))
    : Object.entries(rows.reduce<Record<string, number>>((m, r) => { m[r.category] = (m[r.category] ?? 0) + n(r.total); return m; }, {})).sort((a, b) => b[1] - a[1]).map(([k]) => ({ key: k, label: k }));
  const periods = Array.from(new Set(rows.map(r => r.period))).sort();
  const out = periods.map(p => {
    const mine = rows.filter(r => r.period === p);
    const row: Record<string, Cell> = { period: p, entries: sum(mine, r => n(r.entries)), total: sum(mine, r => n(r.total)) };
    cats.forEach(c => { row[c.key] = sum(mine.filter(r => r.category === c.key), r => n(r.total)); });
    return row;
  });
  const totals: Record<string, Cell> = { period: 'Total', entries: sum(out, r => n(r.entries)), total: sum(out, r => n(r.total)) };
  cats.forEach(c => { totals[c.key] = sum(out, r => n(r[c.key])); });
  return {
    columns: [{ key: 'period', label: group === 'day' ? 'Date' : group === 'month' ? 'Month' : 'Year' }, { key: 'entries', label: 'Entries', num: true }, ...cats.map(c => ({ key: c.key, label: c.label, money: true })), { key: 'total', label: 'Total', money: true }],
    rows: out, totals,
    notes: kind === 'income' ? ['Cash actually received on the payment date. Unpaid invoices and unpaid bookings are not included.'] : ['Expenses by the date they were incurred, including fuel, maintenance and driver payments recorded in their modules.'],
  };
}

// ---------------------------------------------------------------- per-vehicle
async function vehicleSummary(from: string, to: string) {
  const { data, error } = await supabase.rpc('rpt_vehicle_summary', { p_from: from, p_to: to });
  fail(error);
  return (data ?? []) as { vehicle_name: string; revenue: number; expenses: number; payments_count: number; expense_count: number }[];
}

// ---------------------------------------------------------------- reports
export const REPORTS: ReportDef[] = [
  { id: 'income-daily', title: 'Daily income report', group: 'Income', description: 'Cash received each day, by category.', needsRange: true, run: (f, t) => cashByPeriod('income', 'day', f, t) },
  { id: 'income-monthly', title: 'Monthly income report', group: 'Income', description: 'Cash received each month, by category.', needsRange: true, run: (f, t) => cashByPeriod('income', 'month', f, t) },
  { id: 'income-yearly', title: 'Yearly income report', group: 'Income', description: 'Cash received each year, by category.', needsRange: true, run: (f, t) => cashByPeriod('income', 'year', f, t) },
  { id: 'expense-daily', title: 'Daily expense report', group: 'Expenses', description: 'Money spent each day, by category.', needsRange: true, run: (f, t) => cashByPeriod('expense', 'day', f, t) },
  { id: 'expense-monthly', title: 'Monthly expense report', group: 'Expenses', description: 'Money spent each month, by category.', needsRange: true, run: (f, t) => cashByPeriod('expense', 'month', f, t) },
  { id: 'expense-yearly', title: 'Yearly expense report', group: 'Expenses', description: 'Money spent each year, by category.', needsRange: true, run: (f, t) => cashByPeriod('expense', 'year', f, t) },

  { id: 'vehicle-revenue', title: 'Vehicle-wise revenue', group: 'Vehicles', description: 'Cash received per vehicle (school fees count towards the student\'s assigned vehicle).', needsRange: true, run: async (f, t) => {
    const r = (await vehicleSummary(f, t)).filter(x => n(x.revenue) > 0); const total = sum(r, x => n(x.revenue));
    return { columns: [{ key: 'v', label: 'Vehicle' }, { key: 'c', label: 'Payments', num: true }, { key: 'r', label: 'Revenue', money: true }, { key: 's', label: 'Share' }],
      rows: r.map(x => ({ v: x.vehicle_name, c: n(x.payments_count), r: n(x.revenue), s: pct(n(x.revenue), total) })), totals: { v: 'Total', c: sum(r, x => n(x.payments_count)), r: total, s: '' } };
  } },
  { id: 'vehicle-expenses', title: 'Vehicle-wise expenses', group: 'Vehicles', description: 'Expenses charged to each vehicle.', needsRange: true, run: async (f, t) => {
    const r = (await vehicleSummary(f, t)).filter(x => n(x.expenses) > 0).sort((a, b) => n(b.expenses) - n(a.expenses)); const total = sum(r, x => n(x.expenses));
    return { columns: [{ key: 'v', label: 'Vehicle' }, { key: 'c', label: 'Entries', num: true }, { key: 'e', label: 'Expenses', money: true }, { key: 's', label: 'Share' }],
      rows: r.map(x => ({ v: x.vehicle_name, c: n(x.expense_count), e: n(x.expenses), s: pct(n(x.expenses), total) })), totals: { v: 'Total', c: sum(r, x => n(x.expense_count)), e: total, s: '' } };
  } },
  { id: 'vehicle-net', title: 'Vehicle-wise net contribution', group: 'Vehicles', description: 'Revenue minus expenses for each vehicle.', needsRange: true, run: async (f, t) => {
    const r = await vehicleSummary(f, t);
    return { columns: [{ key: 'v', label: 'Vehicle' }, { key: 'r', label: 'Revenue', money: true }, { key: 'e', label: 'Expenses', money: true }, { key: 'net', label: 'Net contribution', money: true }],
      rows: r.map(x => ({ v: x.vehicle_name, r: n(x.revenue), e: n(x.expenses), net: n(x.revenue) - n(x.expenses) })),
      totals: { v: 'Total', r: sum(r, x => n(x.revenue)), e: sum(r, x => n(x.expenses)), net: sum(r, x => n(x.revenue) - n(x.expenses)) },
      notes: ['"Not allocated to a vehicle" holds income and expenses that were not linked to any vehicle (for example office costs).'] };
  } },

  { id: 'school-revenue', title: 'School transport revenue', group: 'School transport', description: 'Invoiced, paid and outstanding by school for the billing months in the period.', needsRange: true, run: async (f, t) => {
    const inv = await fetchAll<{ total_payable: number; amount_paid: number; balance: number; student_id: string; schools: { name: string } | null }>((a, b) =>
      supabase.from('invoices').select('total_payable,amount_paid,balance,student_id, schools(name)').neq('status', 'cancelled').gte('billing_month', f.slice(0, 7) + '-01').lte('billing_month', t).range(a, b));
    const by: Record<string, { students: Set<string>; inv: number; paid: number; bal: number }> = {};
    inv.forEach(i => { const k = i.schools?.name ?? '—'; const x = (by[k] ??= { students: new Set(), inv: 0, paid: 0, bal: 0 }); x.students.add(i.student_id); x.inv += n(i.total_payable); x.paid += n(i.amount_paid); x.bal += n(i.balance); });
    const rows = Object.entries(by).map(([k, x]) => ({ school: k, students: x.students.size, inv: x.inv, paid: x.paid, bal: x.bal })).sort((a, b) => b.inv - a.inv);
    return { columns: [{ key: 'school', label: 'School' }, { key: 'students', label: 'Students', num: true }, { key: 'inv', label: 'Invoiced', money: true }, { key: 'paid', label: 'Paid to date', money: true }, { key: 'bal', label: 'Outstanding', money: true }],
      rows, totals: { school: 'Total', students: '', inv: sum(rows, r => r.inv), paid: sum(rows, r => r.paid), bal: sum(rows, r => r.bal) },
      notes: ['Invoiced = billed amounts for the billing months in the period. "Paid to date" is cash received against those invoices so far; outstanding is still receivable, not collected.'] };
  } },
  { id: 'student-payments', title: 'Student payment report', group: 'School transport', description: 'Every school-fee payment received in the period.', needsRange: true, run: async (f, t) => {
    const p = await fetchAll<{ payment_date: string; reference: string; amount: number; method: string; students: { full_name: string; student_code: string } | null; invoices: { invoice_number: string } | null }>((a, b) =>
      supabase.from('payments').select('payment_date,reference,amount,method, students(full_name,student_code), invoices(invoice_number)').eq('category', 'school_transport').gte('payment_date', f).lte('payment_date', t).order('payment_date').range(a, b));
    return { columns: [{ key: 'd', label: 'Date' }, { key: 'ref', label: 'Receipt' }, { key: 's', label: 'Student' }, { key: 'inv', label: 'Applied to' }, { key: 'm', label: 'Method' }, { key: 'a', label: 'Amount', money: true }],
      rows: p.map(x => ({ d: x.payment_date, ref: x.reference, s: x.students ? `${x.students.full_name} (${x.students.student_code})` : '—', inv: x.invoices?.invoice_number ?? 'Advance credit', m: pretty(x.method), a: n(x.amount) })),
      totals: { d: 'Total', ref: '', s: '', inv: '', m: '', a: sum(p, x => n(x.amount)) } };
  } },
  { id: 'student-outstanding', title: 'Outstanding student balances', group: 'School transport', description: 'Unpaid student balances up to the end date (receivables, not cash).', needsRange: false, run: async (_f, t) => {
    const inv = await fetchAll<{ balance: number; due_date: string; student_id: string; students: { full_name: string; student_code: string } | null; schools: { name: string } | null }>((a, b) =>
      supabase.from('invoices').select('balance,due_date,student_id, students(full_name,student_code), schools(name)').neq('status', 'cancelled').gt('balance', 0).lte('billing_month', t).range(a, b));
    const by: Record<string, { name: string; school: string; count: number; oldest: string; bal: number }> = {};
    inv.forEach(i => { const x = (by[i.student_id] ??= { name: i.students ? `${i.students.full_name} (${i.students.student_code})` : '—', school: i.schools?.name ?? '—', count: 0, oldest: i.due_date, bal: 0 }); x.count++; x.bal += n(i.balance); if (i.due_date < x.oldest) x.oldest = i.due_date; });
    const today = new Date().toISOString().slice(0, 10);
    const rows = Object.values(by).sort((a, b) => b.bal - a.bal).map(x => ({ s: x.name, sch: x.school, c: x.count, o: x.oldest, late: x.oldest < today ? Math.floor((new Date(today).getTime() - new Date(x.oldest).getTime()) / 86400000) : 0, bal: x.bal }));
    return { columns: [{ key: 's', label: 'Student' }, { key: 'sch', label: 'School' }, { key: 'c', label: 'Open invoices', num: true }, { key: 'o', label: 'Oldest due date' }, { key: 'late', label: 'Days overdue', num: true }, { key: 'bal', label: 'Balance', money: true }],
      rows, totals: { s: 'Total receivable', sch: '', c: sum(rows, r => r.c), o: '', late: '', bal: sum(rows, r => r.bal) } };
  } },

  { id: 'hire-revenue', title: 'Hire booking revenue', group: 'Hires', description: 'Confirmed, in-progress and completed hires starting in the period.', needsRange: true, run: async (f, t) => {
    const b = await fetchAll<{ id: string; reference: string; start_at: string; status: string; agreed_price: number; customers: { full_name: string } | null; vehicles: { name: string } | null }>((a, z) =>
      supabase.from('hire_bookings').select('id,reference,start_at,status,agreed_price, customers(full_name), vehicles(name)').in('status', ['confirmed', 'in_progress', 'completed']).gte('start_at', `${f}T00:00:00+05:30`).lte('start_at', `${t}T23:59:59+05:30`).order('start_at').range(a, z));
    const paid: Record<string, number> = {};
    for (let i = 0; i < b.length; i += 100) { const ids = b.slice(i, i + 100).map(x => x.id); const { data, error } = await supabase.from('payments').select('booking_id,amount').in('booking_id', ids); fail(error); (data ?? []).forEach(p => { const k = (p as { booking_id: string }).booking_id; paid[k] = (paid[k] ?? 0) + n((p as { amount: number }).amount); }); }
    const rows = b.map(x => ({ ref: x.reference, d: x.start_at.slice(0, 10), c: x.customers?.full_name ?? '—', v: x.vehicles?.name ?? '—', st: pretty(x.status), price: n(x.agreed_price), paid: paid[x.id] ?? 0, bal: n(x.agreed_price) - (paid[x.id] ?? 0) }));
    return { columns: [{ key: 'ref', label: 'Booking' }, { key: 'd', label: 'Date' }, { key: 'c', label: 'Customer' }, { key: 'v', label: 'Vehicle' }, { key: 'st', label: 'Status' }, { key: 'price', label: 'Agreed price', money: true }, { key: 'paid', label: 'Cash received', money: true }, { key: 'bal', label: 'Balance', money: true }],
      rows, totals: { ref: 'Total', d: '', c: '', v: '', st: '', price: sum(rows, r => r.price), paid: sum(rows, r => r.paid), bal: sum(rows, r => r.bal) },
      notes: ['Agreed price is the booked value. Only "Cash received" has actually been collected.'] };
  } },
  { id: 'customer-payments', title: 'Customer payment history', group: 'Hires', description: 'Payments received from hire customers in the period.', needsRange: true, run: async (f, t) => {
    const p = await fetchAll<{ payment_date: string; reference: string; amount: number; method: string; hire_bookings: { reference: string; customers: { full_name: string } | null } | null }>((a, b) =>
      supabase.from('payments').select('payment_date,reference,amount,method, hire_bookings!inner(reference, customers(full_name))').not('booking_id', 'is', null).gte('payment_date', f).lte('payment_date', t).order('payment_date').range(a, b));
    return { columns: [{ key: 'd', label: 'Date' }, { key: 'ref', label: 'Receipt' }, { key: 'c', label: 'Customer' }, { key: 'b', label: 'Booking' }, { key: 'm', label: 'Method' }, { key: 'a', label: 'Amount', money: true }],
      rows: p.map(x => ({ d: x.payment_date, ref: x.reference, c: x.hire_bookings?.customers?.full_name ?? '—', b: x.hire_bookings?.reference ?? '—', m: pretty(x.method), a: n(x.amount) })),
      totals: { d: 'Total', ref: '', c: '', b: '', m: '', a: sum(p, x => n(x.amount)) } };
  } },
  { id: 'driver-payments', title: 'Driver payment report', group: 'Hires', description: 'Agreed driver fees, amounts paid and driver liabilities for hires starting in the period.', needsRange: true, run: async (f, t) => {
    const a = await fetchAll<{ agreed_fee: number; advance_paid: number; payment_status: string; drivers: { full_name: string } | null; hire_bookings: { reference: string; start_at: string; status: string } }>((x, y) =>
      supabase.from('booking_driver_assignments').select('agreed_fee,advance_paid,payment_status, drivers(full_name), hire_bookings!inner(reference,start_at,status)').neq('hire_bookings.status', 'cancelled').gte('hire_bookings.start_at', `${f}T00:00:00+05:30`).lte('hire_bookings.start_at', `${t}T23:59:59+05:30`).range(x, y));
    const rows = a.map(x => ({ dr: x.drivers?.full_name ?? '—', b: x.hire_bookings.reference, d: x.hire_bookings.start_at.slice(0, 10), fee: n(x.agreed_fee), paid: n(x.advance_paid), rem: n(x.agreed_fee) - n(x.advance_paid), st: pretty(x.payment_status) })).sort((p, q) => p.d.localeCompare(q.d));
    return { columns: [{ key: 'dr', label: 'Driver' }, { key: 'b', label: 'Booking' }, { key: 'd', label: 'Date' }, { key: 'fee', label: 'Agreed fee', money: true }, { key: 'paid', label: 'Paid', money: true }, { key: 'rem', label: 'Still owed', money: true }, { key: 'st', label: 'Status' }],
      rows, totals: { dr: 'Total', b: '', d: '', fee: sum(rows, r => r.fee), paid: sum(rows, r => r.paid), rem: sum(rows, r => r.rem), st: '' }, notes: ['"Still owed" is a driver liability — money the business owes but has not yet paid.'] };
  } },

  { id: 'fuel', title: 'Fuel spending report', group: 'Fleet', description: 'Fuel purchases, litres and cost per km by vehicle.', needsRange: true, run: async (f, t) => {
    const r = await fetchAll<{ vehicle_id: string; litres: number; total_cost: number; odometer_km: number | null; vehicles: { name: string } | null }>((a, b) =>
      supabase.from('fuel_records').select('vehicle_id,litres,total_cost,odometer_km, vehicles(name)').gte('fuel_date', f).lte('fuel_date', t).range(a, b));
    const by: Record<string, { name: string; fills: number; litres: number; cost: number; odo: { km: number; l: number; c: number }[] }> = {};
    r.forEach(x => { const y = (by[x.vehicle_id] ??= { name: x.vehicles?.name ?? '—', fills: 0, litres: 0, cost: 0, odo: [] }); y.fills++; y.litres += n(x.litres); y.cost += n(x.total_cost); if (x.odometer_km !== null) y.odo.push({ km: n(x.odometer_km), l: n(x.litres), c: n(x.total_cost) }); });
    const rows = Object.values(by).sort((a, b) => b.cost - a.cost).map(y => { const o = y.odo.sort((a, b) => a.km - b.km); const dist = o.length >= 2 ? o[o.length - 1].km - o[0].km : 0; const w = o.slice(1);
      return { v: y.name, fills: y.fills, l: y.litres, cost: y.cost, ppl: y.litres ? y.cost / y.litres : 0, dist, cpk: dist > 0 ? sum(w, z => z.c) / dist : null, kpl: dist > 0 ? dist / sum(w, z => z.l) : null }; });
    return { columns: [{ key: 'v', label: 'Vehicle' }, { key: 'fills', label: 'Fills', num: true }, { key: 'l', label: 'Litres', num: true }, { key: 'cost', label: 'Fuel cost', money: true }, { key: 'ppl', label: 'Avg price / L', money: true }, { key: 'dist', label: 'Km driven', num: true }, { key: 'cpk', label: 'Cost / km', money: true }, { key: 'kpl', label: 'Km / L', num: true }],
      rows, totals: { v: 'Total', fills: sum(rows, x => x.fills), l: sum(rows, x => x.l), cost: sum(rows, x => x.cost), ppl: '', dist: '', cpk: '', kpl: '' }, notes: ['Cost per km needs at least two odometer readings in the period; otherwise it shows blank.'] };
  } },
  { id: 'maintenance', title: 'Maintenance expenditure report', group: 'Fleet', description: 'Servicing and repair costs in the period.', needsRange: true, run: async (f, t) => {
    const r = await fetchAll<{ service_date: string; category: string; description: string | null; service_provider: string | null; cost: number; vehicles: { name: string } | null }>((a, b) =>
      supabase.from('vehicle_maintenance').select('service_date,category,description,service_provider,cost, vehicles(name)').gte('service_date', f).lte('service_date', t).order('service_date').range(a, b));
    const byCat: Record<string, number> = {}; r.forEach(x => { byCat[x.category] = (byCat[x.category] ?? 0) + n(x.cost); });
    return { columns: [{ key: 'd', label: 'Date' }, { key: 'v', label: 'Vehicle' }, { key: 'c', label: 'Type' }, { key: 'desc', label: 'Description' }, { key: 'p', label: 'Provider' }, { key: 'cost', label: 'Cost', money: true }],
      rows: r.map(x => ({ d: x.service_date, v: x.vehicles?.name ?? '—', c: pretty(x.category), desc: x.description ?? '', p: x.service_provider ?? '', cost: n(x.cost) })),
      totals: { d: 'Total', v: '', c: '', desc: '', p: '', cost: sum(r, x => n(x.cost)) }, notes: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${pretty(k)}: ${v.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`) };
  } },

  { id: 'profit-loss', title: 'Overall profit & loss', group: 'Summary', description: 'Cash collected vs expenses, with receivables and driver liabilities shown separately.', needsRange: true, run: async (f, t) => {
    const [inc, exp, pos] = await Promise.all([cashByPeriod('income', 'year', f, t), cashByPeriod('expense', 'year', f, t), supabase.rpc('rpt_position', { p_from: f, p_to: t })]);
    fail(pos.error);
    const p = pos.data as Record<string, number>;
    const incT = n(inc.totals?.total), expT = n(exp.totals?.total);
    const rows: Record<string, Cell>[] = [{ item: 'CASH COLLECTED (income)', amount: null }];
    INCOME_CATS.forEach(([k, l]) => { const v = n(inc.totals?.[k]); if (v) rows.push({ item: `   ${l}`, amount: v }); });
    rows.push({ item: 'Total cash collected', amount: incT }, { item: 'BUSINESS EXPENSES', amount: null });
    exp.columns.filter(c => !['period', 'entries', 'total'].includes(c.key)).forEach(c => { const v = n(exp.totals?.[c.key]); if (v) rows.push({ item: `   ${c.label}`, amount: v }); });
    rows.push({ item: 'Total expenses', amount: expT }, { item: 'NET OPERATING RESULT (cash collected − expenses)', amount: incT - expT },
      { item: 'MEMO — NOT INCLUDED IN THE RESULT ABOVE', amount: null },
      { item: '   Student fees invoiced in period', amount: n(p.student_invoiced) }, { item: '   Student fees outstanding (receivable, as of today)', amount: n(p.student_outstanding) },
      { item: '   Hire value booked in period', amount: n(p.hire_booked) }, { item: '   Hire balances outstanding (receivable, as of today)', amount: n(p.hire_outstanding) },
      { item: '   Driver fees still owed (liability, as of today)', amount: n(p.driver_liabilities) }, { item: '   Advance payments held as student credit', amount: n(p.advance_credits) });
    return { columns: [{ key: 'item', label: 'Item' }, { key: 'amount', label: 'Amount', money: true }], rows, notes: ['Cash basis: unpaid invoices and bookings are receivables and are never counted as collected cash.'] };
  } },
];
