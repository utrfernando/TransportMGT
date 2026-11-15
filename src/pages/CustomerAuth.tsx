import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/public/AuthShell';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';

const loginSchema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });

/** Parents, guardians and hire customers sign in here. Staff use /login. */
export const CustomerLogin: React.FC = () => {
  const { signInCustomer, authUserId, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const next = params.get('next');
  const dest = next && next.startsWith('/account') ? next : '/account';
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });
  if (!loading && authUserId) return <Navigate to={dest} replace />;
  return (
    <AuthShell title="Sign in to your account" subtitle="See your child’s route and fees, or your hires and payments.">
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
        setError(null);
        try { await signInCustomer(v.email, v.password); navigate(dest, { replace: true }); }
        catch (e) {
          const m = e instanceof Error ? e.message : 'Sign in failed';
          setError(/not confirmed/i.test(m) ? 'Please confirm your email first — open the link we sent you, then sign in.' : /invalid login/i.test(m) ? 'Email or password is incorrect.' : m);
        }
      })}>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        <Button type="submit" variant="navy" className="w-full" size="lg" loading={isSubmitting}>Sign in</Button>
        <div className="flex justify-between text-sm font-bold">
          <Link to="/forgot-password" className="text-navy-600 hover:text-navy-800">Forgot password?</Link>
          <Link to="/account/register" className="text-navy-600 hover:text-navy-800">Create an account</Link>
        </div>
      </form>
      <p className="mt-6 text-xs text-slate-500 border-t border-navy-100 pt-4">Staff member? <Link to="/login" className="font-bold text-navy-700 underline">Staff sign in</Link></p>
    </AuthShell>
  );
};

const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name').max(100),
  phone: z.string().trim().regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid phone number'),
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(10, 'At least 10 characters'),
  confirm: z.string(),
}).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const CustomerRegister: React.FC = () => {
  const { signUp, authUserId, loading } = useAuth();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(registerSchema) });
  if (!loading && authUserId && !sentTo) return <Navigate to="/account" replace />;

  const resend = async () => {
    if (!sentTo) return;
    setResending(true);
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: `${window.location.origin}/account` } });
    setResending(false);
    if (e) toast.error(e.message); else toast.success('Confirmation email sent again');
  };

  if (sentTo) return (
    <AuthShell title="Check your email" subtitle="One more step before you can sign in.">
      <div className="text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-navy-800 text-sunshine-400 flex items-center justify-center"><MailCheck size={32} /></div>
        <p className="text-slate-700">We sent a confirmation link to <b className="text-navy-900">{sentTo}</b>. Open it, then come back and sign in. Check your spam folder if you don’t see it.</p>
        <p className="text-sm text-slate-500">After signing in you will be asked for the <b>access code</b> that we give you when your child joins or your hire is booked.</p>
        <div className="flex gap-2 justify-center"><Button variant="navyOutline" onClick={resend} loading={resending}>Resend email</Button><Link to="/account/login"><Button variant="navy">Go to sign in</Button></Link></div>
      </div>
    </AuthShell>
  );

  return (
    <AuthShell title="Create your account" subtitle="For parents, guardians and customers of our services.">
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
        setError(null);
        try {
          const r = await signUp(v.email, v.password, v.full_name, v.phone);
          if (r.needsConfirmation) setSentTo(v.email); else window.location.assign('/account');
        } catch (e) {
          const m = e instanceof Error ? e.message : 'Could not create the account';
          setError(/already registered|already been registered/i.test(m) ? 'An account with this email already exists. Try signing in.' : /rate limit/i.test(m) ? 'Too many sign-up emails right now. Please try again in a little while.' : /signups? not allowed|signup.*disabled/i.test(m) ? 'Online sign-up is not available yet. Please contact us.' : m);
        }
      })}>
        <Field label="Full name" error={errors.full_name?.message}><Input autoComplete="name" {...register('full_name')} /></Field>
        <Field label="Mobile number" error={errors.phone?.message}><Input type="tel" autoComplete="tel" {...register('phone')} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password" error={errors.password?.message} hint="At least 10 characters"><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
          <Field label="Confirm" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
        </div>
        {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        <Button type="submit" variant="navy" className="w-full" size="lg" loading={isSubmitting}>Create account</Button>
        <p className="text-xs text-slate-500">Creating an account does not show any records yet. We link your child’s or your hire records to you with a one-time access code that we give you.</p>
        <p className="text-sm text-center font-bold text-slate-500">Already have an account? <Link to="/account/login" className="text-navy-700 underline">Sign in</Link></p>
      </form>
    </AuthShell>
  );
};
