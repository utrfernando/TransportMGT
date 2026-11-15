import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Input';

const pwSchema = z.object({ password: z.string().min(10, 'At least 10 characters'), confirm: z.string() }).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

/** First sign-in with a temporary password: the person must choose their own before using anything else. */
const MustChangePassword: React.FC = () => {
  const { updatePassword } = useAuth();
  const toast = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(pwSchema) });
  return (
    <section className="rounded-2xl bg-white border-2 border-sunshine-300 shadow-sm p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold text-navy-900 flex items-center gap-2"><KeyRound size={20} className="text-sunshine-600" /> Choose your own password</h2>
      <p className="text-sm text-slate-600 mt-1">We gave you a temporary password. For your security, please choose a new one that only you know. Your account stays locked to this step until you do.</p>
      <form className="grid sm:grid-cols-2 gap-4 max-w-xl mt-4" noValidate onSubmit={handleSubmit(async v => {
        try { await updatePassword(v.password); toast.success('Password saved. Welcome!'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the password'); }
      })}>
        <Field label="New password" error={errors.password?.message} hint="At least 10 characters"><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <Field label="Confirm" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        <div className="sm:col-span-2"><Button type="submit" variant="navy" loading={isSubmitting}>Save my password</Button></div>
      </form>
    </section>
  );
};

export default MustChangePassword;
