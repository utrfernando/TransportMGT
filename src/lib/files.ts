import { supabase } from './supabase';

export const DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_FILE_MB = 10;

/** Returns an error message if the file is not allowed, otherwise null. Mirrors the bucket limits. */
export function validateFile(f: File): string | null {
  if (!DOC_TYPES.includes(f.type)) return `${f.name}: only JPG, PNG, WebP or PDF files are allowed`;
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `${f.name} is over ${MAX_FILE_MB} MB`;
  return null;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

/** Uploads to the PRIVATE bucket and returns the storage path (never a public URL). */
export async function uploadPrivate(file: File, folder: string): Promise<string> {
  const bad = validateFile(file);
  if (bad) throw new Error(bad);
  const path = `${folder}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error } = await supabase.storage.from('private-files').upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

/** Opens a short-lived signed link to a private file in a new tab. */
export async function openPrivate(path: string): Promise<void> {
  const { data, error } = await supabase.storage.from('private-files').createSignedUrl(path, 300);
  if (error || !data) throw new Error(error?.message ?? 'Could not open file');
  window.open(data.signedUrl, '_blank', 'noopener');
}

export async function removePrivate(path: string): Promise<void> {
  await supabase.storage.from('private-files').remove([path]);
}
