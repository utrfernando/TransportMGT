import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isSupabaseConfigured } from '../lib/supabase';
import AuthShell from '../components/public/AuthShell';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';

const loginSchema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });

/** Staff (owner / administrator) sign-in. Customers and parents use /account/login. */
export const Login: React.FC = () => {
  const { signIn, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const next = params.get('next');
  const dest = next && next.startsWith('/admin') ? next : '/admin';
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });

  if (!loading && isAdmin) return <Navigate to={dest} replace />;

  return (
    <AuthShell kind="staff" title="Staff sign in" subtitle="For the business owner and administrators only.">
      {!isSupabaseConfigured && <p className="mb-4 rounded-xl bg-sunshine-50 text-sunshine-700 text-sm font-semibold p-3">Supabase is not configured. Add your keys to .env.</p>}
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
        setError(null);
        try { await signIn(v.email, v.password); navigate(dest, { replace: true }); }
        catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed'); }
      })}>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
        <Button type="submit" variant="navy" className="w-full" size="lg" loading={isSubmitting}>Sign in</Button>
        <div className="flex justify-between text-sm font-bold">
          <Link to="/forgot-password" className="text-navy-600 hover:text-navy-800">Forgot password?</Link>
          <Link to="/account/login" className="text-slate-500 hover:text-navy-800">Customer / parent login</Link>
        </div>
      </form>
    </AuthShell>
  );
};

export const ForgotPassword: React.FC = () => {
  const { sendPasswordReset } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email') })) });
  return (
    <AuthShell title="Reset your password" subtitle="We will email you a secure link to choose a new one.">
      {sent ? (
        <div><p className="text-slate-700 mb-4">If that email belongs to an account, a reset link is on its way. It can take a few minutes — check your spam folder too.</p><Link to="/account/login"><Button variant="navyOutline" className="w-full">Back to sign in</Button></Link></div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
          setError(null);
          try { await sendPasswordReset(v.email); setSent(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send email'); }
        })}>
          <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
          {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
          <Button type="submit" variant="navy" className="w-full" size="lg" loading={isSubmitting}>Send reset link</Button>
          <Link to="/account/login" className="block text-center text-sm font-bold text-navy-600">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
};

const resetSchema = z.object({ password: z.string().min(10, 'At least 10 characters'), confirm: z.string() }).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const ResetPassword: React.FC = () => {
  const { updatePassword, authUserId, loading, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(resetSchema) });
  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 10 characters.">
      {!loading && !authUserId ? (
        <div><p className="text-slate-700 mb-4">This reset link is invalid or has expired.</p><Link to="/forgot-password"><Button variant="navy" className="w-full">Request a new link</Button></Link></div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
          setError(null);
          try { await updatePassword(v.password); toast.success('Password updated'); navigate(isAdmin ? '/admin' : '/account', { replace: true }); }
          catch (e) { setError(e instanceof Error ? e.message : 'Could not update password'); }
        })}>
          <Field label="New password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
          <Field label="Confirm password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
          {error && <p className="text-sm font-semibold text-red-600" role="alert">{error}</p>}
          <Button type="submit" variant="navy" className="w-full" size="lg" loading={isSubmitting}>Update password</Button>
        </form>
      )}
    </AuthShell>
  );
};
