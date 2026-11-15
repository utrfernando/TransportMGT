import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Bus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';

const Shell: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({ title, subtitle, children }) => {
  const { settings } = useSettings();
  return (
    <div className="min-h-screen bg-gradient-to-br from-mint-400 via-mint-300 to-sunshine-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-4xl bg-white shadow-soft-lg p-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-ink-400 hover:text-mint-600 mb-5"><ArrowLeft size={14} /> Back to website</Link>
        <div className="flex items-center gap-3 mb-6">
          <span className="h-12 w-12 rounded-2xl bg-mint-500 text-white flex items-center justify-center shadow-soft"><Bus size={24} /></span>
          <div><p className="font-display text-xl font-extrabold leading-none">{settings.business_name}</p><p className="text-xs font-bold text-mint-600 uppercase tracking-wider">Staff area</p></div>
        </div>
        <h1 className="font-display text-2xl font-extrabold text-ink-900">{title}</h1>
        <p className="text-ink-500 text-sm mb-6">{subtitle}</p>
        {children}
      </div>
    </div>
  );
};

const loginSchema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });

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
    <Shell title="Sign in" subtitle="Authorised administrators only.">
      {!isSupabaseConfigured && <p className="mb-4 rounded-2xl bg-sunshine-50 text-sunshine-700 text-sm font-semibold p-3">Supabase is not configured. Add your keys to .env.</p>}
      <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
        setError(null);
        try { await signIn(v.email, v.password); navigate(dest, { replace: true }); }
        catch (e) { setError(e instanceof Error ? e.message : 'Sign in failed'); }
      })}>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Sign in</Button>
        <Link to="/forgot-password" className="block text-center text-sm font-bold text-mint-600 hover:text-mint-700">Forgot password?</Link>
      </form>
    </Shell>
  );
};

export const ForgotPassword: React.FC = () => {
  const { sendPasswordReset } = useAuth();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email') })) });
  return (
    <Shell title="Reset password" subtitle="We will email you a secure reset link.">
      {sent ? (
        <div><p className="text-ink-700 mb-4">If that email belongs to an administrator, a reset link is on its way.</p><Link to="/login"><Button variant="outline" className="w-full">Back to sign in</Button></Link></div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
          setError(null);
          try { await sendPasswordReset(v.email); setSent(true); } catch (e) { setError(e instanceof Error ? e.message : 'Could not send email'); }
        })}>
          <Field label="Email" error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Send reset link</Button>
          <Link to="/login" className="block text-center text-sm font-bold text-mint-600">Back to sign in</Link>
        </form>
      )}
    </Shell>
  );
};

const resetSchema = z.object({ password: z.string().min(10, 'At least 10 characters'), confirm: z.string() }).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const ResetPassword: React.FC = () => {
  const { updatePassword, authUserId, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(resetSchema) });
  return (
    <Shell title="Choose a new password" subtitle="Use at least 10 characters.">
      {!loading && !authUserId ? (
        <div><p className="text-ink-700 mb-4">This reset link is invalid or has expired.</p><Link to="/forgot-password"><Button className="w-full">Request a new link</Button></Link></div>
      ) : (
        <form className="space-y-4" noValidate onSubmit={handleSubmit(async v => {
          setError(null);
          try { await updatePassword(v.password); toast.success('Password updated'); navigate('/admin', { replace: true }); }
          catch (e) { setError(e instanceof Error ? e.message : 'Could not update password'); }
        })}>
          <Field label="New password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
          <Field label="Confirm password" error={errors.confirm?.message}><Input type="password" autoComplete="new-password" {...register('confirm')} /></Field>
          {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>Update password</Button>
        </form>
      )}
    </Shell>
  );
};
