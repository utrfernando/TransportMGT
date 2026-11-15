import { describe, expect, it } from 'vitest';
import { formatMoney, whatsappLink, whatsappNumber } from './utils';
import { daysUntil, friendlyError, sanitizeSearch } from './db';
import { colomboDate, isoToLocalInput, localInputToIso } from './time';

describe('WhatsApp links', () => {
  it('turns Sri Lankan local numbers into international format', () => {
    expect(whatsappNumber('077 123 4567')).toBe('94771234567');
    expect(whatsappNumber('+94 77 123 4567')).toBe('94771234567');
    expect(whatsappNumber('')).toBe('');
  });
  it('encodes the prefilled message and returns null without a number', () => {
    expect(whatsappLink('0771234567', 'Hi there & thanks')).toBe('https://wa.me/94771234567?text=Hi%20there%20%26%20thanks');
    expect(whatsappLink(null, 'x')).toBeNull();
  });
});

describe('money', () => {
  it('formats LKR with two decimals and separators', () => {
    expect(formatMoney(1234.5)).toBe('Rs. 1,234.50');
    expect(formatMoney('0')).toBe('Rs. 0.00');
    expect(formatMoney(null)).toBe('Rs. 0.00');
  });
});

describe('database error messages', () => {
  it('explains duplicates and conflicts in plain words', () => {
    expect(friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint "uq_customers_phone"' })).toMatch(/phone number already exists/);
    expect(friendlyError({ code: '23505', message: 'x "uq_vehicles_reg"' })).toMatch(/registration number/);
    expect(friendlyError({ code: '23P01', message: 'conflicting key value' })).toMatch(/overlapping/);
    expect(friendlyError({ code: '42501', message: 'denied' })).toMatch(/permission/);
    expect(friendlyError({ message: 'Payment exceeds invoice balance' })).toBe('Payment exceeds invoice balance');
  });
  it('strips characters that could break a PostgREST filter', () => {
    expect(sanitizeSearch(' a,b(c)%*d ')).toBe('abcd');
  });
});

describe('dates and Sri Lanka time', () => {
  it('counts days until a date', () => {
    const d = new Date(); d.setDate(d.getDate() + 5);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(daysUntil(iso)).toBe(5);
    expect(daysUntil(null)).toBeNull();
  });
  it('treats typed booking times as Colombo time (UTC+5:30) regardless of the computer timezone', () => {
    expect(localInputToIso('2026-12-05T09:00')).toBe('2026-12-05T03:30:00.000Z');
    expect(isoToLocalInput('2026-12-05T03:30:00.000Z')).toBe('2026-12-05T09:00');
    expect(colomboDate('2026-12-05T20:00:00.000Z')).toBe('2026-12-06'); // 01:30 next day in Colombo
  });
});
