import { formatInTimeZone } from 'date-fns-tz';

/** The business operates in Sri Lanka; all booking times are entered and shown in this zone. */
export const TZ = 'Asia/Colombo';

/** "2026-12-05T09:00" (as typed in <input type=datetime-local>) -> ISO string with the Colombo offset. */
export const localInputToIso = (v: string) => new Date(`${v}:00+05:30`).toISOString();

/** ISO timestamp -> value for <input type=datetime-local>, in Colombo time. */
export const isoToLocalInput = (iso: string) => formatInTimeZone(new Date(iso), TZ, "yyyy-MM-dd'T'HH:mm");

export const fmtDateTime = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'dd MMM yyyy, HH:mm');
export const fmtDate = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'dd MMM yyyy');
export const fmtTime = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'HH:mm');
export const colomboDate = (iso: string) => formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd');
