import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bus, CheckCircle2 } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import VehicleArt from './VehicleArt';

/** Sign-in / sign-up screens for customers and staff share this two-panel layout. */
const AuthShell: React.FC<{ title: string; subtitle: string; children: React.ReactNode; kind?: 'customer' | 'staff' }> = ({ title, subtitle, children, kind = 'customer' }) => {
  const { settings } = useSettings();
  return (
    <div className="guest min-h-screen grid lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden lg:flex relative flex-col justify-between overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 text-white p-12">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-sunshine-400/10 blur-3xl" aria-hidden />
        <Link to="/" className="relative inline-flex items-center gap-2.5">
          <span className="h-10 w-10 rounded-xl bg-white/10 text-sunshine-400 flex items-center justify-center"><Bus size={22} /></span>
          <span className="font-display text-xl font-extrabold">{settings.business_name}</span>
        </Link>
        <div className="relative">
          <h2 className="font-display text-4xl font-extrabold leading-tight">{kind === 'customer' ? <>Your trips and payments,<br /><span className="text-sunshine-400">all in one place.</span></> : <>Run the business,<br /><span className="text-sunshine-400">safely and simply.</span></>}</h2>
          <ul className="mt-6 space-y-3 text-navy-100">
            {(kind === 'customer'
              ? ['Your child’s route, pickup points and timings', 'Monthly fees, payments and receipts', 'Your hires, quotations and balances']
              : ['Fleet, schools, students and bookings', 'Billing, payments and reports', 'Private records protected by role-based access']).map(t => (
              <li key={t} className="flex gap-3"><CheckCircle2 size={20} className="text-sunshine-400 shrink-0 mt-0.5" />{t}</li>))}
          </ul>
        </div>
        <div className="relative -mb-4 w-72 opacity-95"><VehicleArt kind="bus" /></div>
      </aside>
      <main className="flex items-center justify-center p-5 sm:p-10 bg-navy-50/50">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-navy-500 hover:text-navy-800 mb-6"><ArrowLeft size={15} /> Back to website</Link>
          <div className="rounded-2xl bg-white shadow-xl shadow-navy-900/10 border border-navy-100 p-7 sm:p-9">
            <h1 className="font-display text-2xl font-extrabold text-navy-900">{title}</h1>
            <p className="text-slate-500 text-sm mt-1 mb-6">{subtitle}</p>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AuthShell;
