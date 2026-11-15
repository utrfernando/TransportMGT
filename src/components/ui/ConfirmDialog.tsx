import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

export const ConfirmDialog: React.FC<{
  open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean;
  onConfirm: () => void; onClose: () => void;
}> = ({ open, title, message, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose }) => (
  <Modal open={open} onClose={onClose} title={title}>
    <p className="text-ink-600 mb-6">{message}</p>
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </Modal>
);
