import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatMoney = (n: number | string | null | undefined, currency = 'LKR') =>
  `${currency === 'LKR' ? 'Rs.' : currency} ${Number(n ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Digits-only phone suitable for wa.me links. Sri Lankan local numbers (07x...) become 947x... */
export function whatsappNumber(raw?: string | null): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.startsWith('0')) return '94' + d.slice(1);
  return d;
}

export function whatsappLink(raw: string | null | undefined, text: string): string | null {
  const n = whatsappNumber(raw);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}
