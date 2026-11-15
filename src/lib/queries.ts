import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured, type Service, type PublicVehicle, type WebsiteContent } from './supabase';

export interface QueryState<T> { data: T; loading: boolean; error: string | null; reload: () => void }

/** Minimal data hook: runs `fn` on mount and whenever `deps` change. */
export function useQuery<T>(fn: () => Promise<T>, initial: T, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then(d => { if (alive) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  return { data, loading, error, reload };
}

const unwrap = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

export const usePublicServices = () => useQuery<Service[]>(async () => {
  if (!isSupabaseConfigured) return [];
  return unwrap(await supabase.from('services').select('*').eq('is_published', true).order('sort_order'));
}, []);

export const usePublicVehicles = () => useQuery<PublicVehicle[]>(async () => {
  if (!isSupabaseConfigured) return [];
  return unwrap(await supabase.from('public_vehicles').select('*').order('sort_order'));
}, []);

export const useWebsiteContent = () => useQuery<Record<string, WebsiteContent>>(async () => {
  if (!isSupabaseConfigured) return {};
  const rows = unwrap(await supabase.from('website_content').select('*').eq('is_published', true)) as WebsiteContent[];
  return Object.fromEntries(rows.map(r => [r.key, r]));
}, {});
