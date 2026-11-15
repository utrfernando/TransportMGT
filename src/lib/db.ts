import { supabase } from './supabase';

type PgError = { message: string; code?: string; details?: string | null };

/** Turn raw Postgres / PostgREST errors into messages a business user can act on. */
export function friendlyError(e: PgError): string {
  switch (e.code) {
    case '23505': {
      const m = `${e.message} ${e.details ?? ''}`;
      if (m.includes('uq_vehicles_reg')) return 'A vehicle with this registration number already exists.';
      if (m.includes('uq_customers_phone')) return 'A customer with this phone number already exists.';
      if (m.includes('uq_driver_licence')) return 'A driver with this licence number already exists.';
      return 'This record already exists (duplicate value).';
    }
    case '23503': return 'This record is linked to other records and cannot be changed this way. Archive it instead.';
    case '23514': return 'One of the values is outside the allowed range. Please check the form.';
    case '23P01': return 'This conflicts with an existing record (overlapping time or assignment).';
    case '42501': return 'You do not have permission to do this.';
    default: return e.message;
  }
}

export function unwrap<T>(res: { data: T | null; error: PgError | null }): T {
  if (res.error) throw new Error(friendlyError(res.error));
  return res.data as T;
}

/** Throws a friendly Error when the mutation failed. */
export function check(res: { error: PgError | null }): void {
  if (res.error) throw new Error(friendlyError(res.error));
}

export const blankToNull = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' || v === undefined ? null : v])) as T;

export const sanitizeSearch = (s: string) => s.trim().replace(/[%,()*]/g, '');

export async function signedUrl(path: string, bucket = 'private-files'): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export const daysUntil = (iso?: string | null): number | null => {
  if (!iso) return null;
  return Math.ceil((new Date(iso + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
};
