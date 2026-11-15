import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import type { PublicSettings } from './supabase';

export interface ReceiptData {
  reference: string;
  date: string;
  amount: number;
  method: string;
  receivedFrom: string;
  forText: string;          // e.g. "School transport — Nov 2026 (INV-...)"
  balanceAfter?: number | null;
  notes?: string | null;
}

const money = (n: number, cur: string) => `${cur === 'LKR' ? 'Rs.' : cur} ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Generates and downloads a one-page A5 payment receipt. Runs entirely in the browser. */
export function downloadReceipt(r: ReceiptData, biz: PublicSettings) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const W = doc.internal.pageSize.getWidth();
  const L = 14;

  doc.setFillColor(20, 184, 166);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(biz.business_name, L, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text([biz.address, biz.phone, biz.email].filter(Boolean).join('  |  ').slice(0, 95), L, 19);

  doc.setTextColor(30, 35, 43);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text('PAYMENT RECEIPT', L, 40);
  doc.setFontSize(10);
  doc.text(r.reference, W - L, 40, { align: 'right' });

  const rows: [string, string][] = [
    ['Date', format(new Date(r.date + 'T00:00:00'), 'dd MMM yyyy')],
    ['Received from', r.receivedFrom],
    ['For', r.forText],
    ['Payment method', r.method.replace('_', ' ')],
  ];
  let y = 52;
  doc.setFontSize(10);
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(110, 118, 135); doc.text(k, L, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 35, 43);
    const lines = doc.splitTextToSize(v, W - L * 2 - 38);
    doc.text(lines, L + 38, y);
    y += 7 * lines.length;
  }

  y += 4;
  doc.setFillColor(240, 253, 249);
  doc.roundedRect(L, y, W - L * 2, 22, 3, 3, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(15, 118, 110);
  doc.text('Amount received', L + 5, y + 9);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(money(r.amount, biz.currency), W - L - 5, y + 14, { align: 'right' });
  y += 30;

  if (r.balanceAfter !== undefined && r.balanceAfter !== null) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 118, 135);
    doc.text('Balance remaining', L, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 35, 43);
    doc.text(money(r.balanceAfter, biz.currency), L + 38, y);
    y += 8;
  }
  if (r.notes) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 118, 135);
    doc.text(doc.splitTextToSize(`Note: ${r.notes}`, W - L * 2), L, y);
  }

  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(200, 205, 215); doc.line(W - L - 45, H - 22, W - L, H - 22);
  doc.setFontSize(8); doc.setTextColor(110, 118, 135); doc.text('Authorised signature', W - L - 45, H - 18);
  doc.text('Thank you for choosing ' + biz.business_name + '.', L, H - 12);

  doc.save(`${r.reference}.pdf`);
}
