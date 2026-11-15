import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import type { Cell, ReportResult } from './reports';
import type { PublicSettings } from './supabase';

const fmtMoney = (v: number) => v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

/** Display text for a cell (money columns get 2 decimals + thousands separators). */
export function cellText(v: Cell, money?: boolean, num?: boolean): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return money ? fmtMoney(v) : num ? v.toLocaleString('en-LK', { maximumFractionDigits: 1 }) : String(v);
  return v;
}

export function exportPdf(title: string, period: string, res: ReportResult, biz: PublicSettings) {
  const doc = new jsPDF({ orientation: res.columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(biz.business_name, 14, 16);
  doc.setFontSize(12); doc.text(title, 14, 24);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 118, 135);
  doc.text(`${period}   |   Currency: ${biz.currency}   |   Generated ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 30);
  doc.setTextColor(30, 35, 43);

  const body = res.rows.map(r => res.columns.map(c => cellText(r[c.key] ?? null, c.money, c.num)));
  const foot = res.totals ? [res.columns.map(c => cellText(res.totals![c.key] ?? null, c.money, c.num))] : undefined;
  autoTable(doc, {
    startY: 35, head: [res.columns.map(c => c.label)], body, foot,
    styles: { fontSize: res.columns.length > 8 ? 7 : 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: [20, 184, 166], textColor: 255 }, footStyles: { fillColor: [240, 253, 249], textColor: [15, 118, 110], fontStyle: 'bold' },
    columnStyles: Object.fromEntries(res.columns.map((c, i) => [i, { halign: c.money || c.num ? 'right' : 'left' }])),
    margin: { left: 14, right: 14 },
  });
  const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  if (res.notes?.length) {
    doc.setFontSize(8.5); doc.setTextColor(110, 118, 135);
    const lines = doc.splitTextToSize(res.notes.join('  •  '), W - 28);
    doc.text(lines, 14, Math.min(last + 8, doc.internal.pageSize.getHeight() - 14));
  }
  doc.save(`${safeName(title)}-${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export function exportExcel(title: string, period: string, res: ReportResult, biz: PublicSettings) {
  const header = [[biz.business_name], [title], [period], [`Currency: ${biz.currency}`], []];
  const aoa: Cell[][] = [...header, res.columns.map(c => c.label), ...res.rows.map(r => res.columns.map(c => r[c.key] ?? null))];
  if (res.totals) aoa.push(res.columns.map(c => res.totals![c.key] ?? null));
  if (res.notes?.length) { aoa.push([]); res.notes.forEach(n => aoa.push([n])); }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // real numbers with a money format, so the sheet can be summed and charted
  const startRow = header.length + 1;
  const lastRow = startRow + res.rows.length + (res.totals ? 1 : 0);
  res.columns.forEach((c, ci) => {
    if (!c.money) return;
    for (let r = startRow; r < lastRow; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c: ci })]; if (cell && typeof cell.v === 'number') cell.z = '#,##0.00'; }
  });
  ws['!cols'] = res.columns.map(c => ({ wch: Math.max(c.label.length + 2, c.money ? 16 : 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  XLSX.writeFile(wb, `${safeName(title)}-${format(new Date(), 'yyyyMMdd')}.xlsx`);
}
