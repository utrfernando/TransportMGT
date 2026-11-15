import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/db';
import { downloadReceipt } from '../../lib/receipt';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';
import { formatMoney } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Field, Input, Select, Textarea } from '../ui/Input';

export interface PaymentTarget {
  kind: 'invoice' | 'booking' | 'advance';
  id?: string;               // invoice id / booking id
  studentId?: string;        // for advance
  title: string;             // modal title
  receivedFrom: string;
  forText: string;
  balance?: number;          // remaining before this payment (not for advance)
}

const schema = z.object({
  amount: z.string().refine(v => v !== '' && !isNaN(Number(v)) && Number(v) > 0, 'Enter an amount greater than zero'),
  payment_date: z.string().min(1, 'Required'),
  method: z.enum(['cash', 'bank_transfer', 'card', 'other']),
  notes: z.string().max(500),
});
type V = z.infer<typeof schema>;

const PaymentModal: React.FC<{ target: PaymentTarget | null; onClose: () => void; onSaved: () => void }> = ({ target, onClose, onSaved }) => {
  const { settings } = useSettings();
  const toast = useToast();
  const [done, setDone] = useState<{ reference: string; amount: number; date: string; method: string; notes: string; balanceAfter: number | null } | null>(null);
  const key = useMemo(() => crypto.randomUUID(), [target]); // one idempotency key per opened modal
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<V>({
    resolver: zodResolver(schema),
    values: { amount: target?.balance && target.balance > 0 ? String(target.balance) : '', payment_date: format(new Date(), 'yyyy-MM-dd'), method: 'cash', notes: '' },
  });

  const close = () => { setDone(null); onClose(); };

  const onSubmit = async (v: V) => {
    if (!target) return;
    const amount = Number(v.amount);
    if (target.balance !== undefined && amount > target.balance + 0.001) { setError('amount', { message: `Cannot exceed the balance (${formatMoney(target.balance, settings.currency)})` }); return; }
    const row: Record<string, unknown> = { reference: '', amount, payment_date: v.payment_date, method: v.method, notes: v.notes.trim() || null, category: 'other', idempotency_key: key };
    if (target.kind === 'invoice') row.invoice_id = target.id;
    else if (target.kind === 'booking') row.booking_id = target.id;
    else row.student_id = target.studentId;
    const { data, error } = await supabase.from('payments').insert(row).select('reference').single();
    if (error) {
      if (error.code === '23505' && error.message.includes('idempotency')) { toast.info('This payment was already recorded.'); onSaved(); close(); return; }
      toast.error(friendlyError(error)); return;
    }
    toast.success('Payment recorded');
    setDone({ reference: (data as { reference: string }).reference, amount, date: v.payment_date, method: v.method, notes: v.notes, balanceAfter: target.balance !== undefined ? Math.max(0, target.balance - amount) : null });
    onSaved();
  };

  const receipt = () => {
    if (!target || !done) return;
    downloadReceipt({ reference: done.reference, date: done.date, amount: done.amount, method: done.method, receivedFrom: target.receivedFrom, forText: target.forText, balanceAfter: done.balanceAfter, notes: done.notes || null }, settings);
  };

  return (
    <Modal open={!!target} onClose={close} title={target?.title}>
      {target && (done ? (
        <div className="text-center space-y-4 py-2">
          <p className="text-ink-700">Receipt <b>{done.reference}</b> for <b>{formatMoney(done.amount, settings.currency)}</b> has been recorded.</p>
          <div className="flex justify-center gap-2"><Button onClick={receipt}><Download size={16} /> Download receipt (PDF)</Button><Button variant="ghost" onClick={close}>Close</Button></div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="rounded-2xl bg-ink-50 p-3 text-sm"><p className="font-bold text-ink-900">{target.receivedFrom}</p><p className="text-ink-500">{target.forText}</p>
            {target.balance !== undefined && <p className="mt-1 font-bold text-mint-700">Balance: {formatMoney(target.balance, settings.currency)}</p>}</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount *" error={errors.amount?.message}><Input inputMode="decimal" {...register('amount')} /></Field>
            <Field label="Date *" error={errors.payment_date?.message}><Input type="date" max={format(new Date(), 'yyyy-MM-dd')} {...register('payment_date')} /></Field>
          </div>
          <Field label="Payment method"><Select {...register('method')}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></Select></Field>
          <Field label="Notes"><Textarea rows={2} {...register('notes')} /></Field>
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit" loading={isSubmitting}>Record payment</Button></div>
        </form>
      ))}
    </Modal>
  );
};

export default PaymentModal;
