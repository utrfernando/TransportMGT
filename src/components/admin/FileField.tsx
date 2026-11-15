import React from 'react';
import { FileText, X } from 'lucide-react';
import { openPrivate, validateFile } from '../../lib/files';
import { useToast } from '../../contexts/ToastContext';
import { Label } from '../ui/Input';

/** Picks a receipt/document file. Shows the already-stored file (if any) with a signed-link viewer. */
const FileField: React.FC<{
  label: string; existingPath: string | null; file: File | null; removed: boolean;
  onFile: (f: File | null) => void; onRemoveExisting: () => void;
}> = ({ label, existingPath, file, removed, onFile, onRemoveExisting }) => {
  const toast = useToast();
  const showExisting = existingPath && !removed && !file;
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {showExisting && (
          <span className="inline-flex items-center gap-2 rounded-full bg-mint-50 px-3 py-1.5 text-sm font-bold text-mint-700">
            <button type="button" className="inline-flex items-center gap-1 hover:underline" onClick={() => openPrivate(existingPath!).catch(e => toast.error(e.message))}><FileText size={14} /> View file</button>
            <button type="button" aria-label="Remove file" onClick={onRemoveExisting}><X size={14} /></button>
          </span>
        )}
        {file && (
          <span className="inline-flex items-center gap-2 rounded-full bg-sunshine-50 px-3 py-1.5 text-sm font-bold text-sunshine-700">
            {file.name}<button type="button" aria-label="Clear" onClick={() => onFile(null)}><X size={14} /></button>
          </span>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm"
          onChange={e => { const f = e.target.files?.[0] ?? null; if (f) { const bad = validateFile(f); if (bad) { toast.error(bad); e.target.value = ''; return; } } onFile(f); }} />
      </div>
      <p className="mt-1 text-xs text-ink-400">JPG, PNG, WebP or PDF, up to 10 MB. Stored privately.</p>
    </div>
  );
};

export default FileField;
