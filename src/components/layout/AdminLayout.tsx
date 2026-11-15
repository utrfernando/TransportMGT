import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { BarChart3, ScrollText, TrendingUp, CreditCard, Fuel, Wrench, FileText, Receipt, CalendarCheck, CalendarDays, Wallet, School, GraduationCap, Route, Users, UserRound, LayoutDashboard, Inbox, Settings, ShieldCheck, ArrowLeft, Menu, Bus, PanelLeftClose, PanelLeftOpen, LogOut, Bell } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

// Items are added here as each module ships in later phases.
const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/vehicles', label: 'Vehicles', icon: Bus },
  { to: '/admin/schools', label: 'Schools', icon: School },
  { to: '/admin/students', label: 'Students', icon: GraduationCap },
  { to: '/admin/routes', label: 'School Routes', icon: Route },
  { to: '/admin/billing', label: 'Student Billing', icon: Receipt },
  { to: '/admin/bookings', label: 'Hire Bookings', icon: CalendarCheck },
  { to: '/admin/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/admin/payments', label: 'Payments', icon: Wallet },
  { to: '/admin/income', label: 'Income', icon: TrendingUp },
  { to: '/admin/expenses', label: 'Expenses', icon: CreditCard },
  { to: '/admin/fuel', label: 'Fuel', icon: Fuel },
  { to: '/admin/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/admin/documents', label: 'Documents & Renewals', icon: FileText },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/drivers', label: 'Drivers', icon: UserRound },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/inquiries', label: 'Inquiries', icon: Inbox },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/settings', label: 'Business Settings', icon: Settings },
  { to: '/admin/users', label: 'User Management', icon: ShieldCheck },
  { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
];

const AdminLayout: React.FC = () => {
  const { settings } = useSettings();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('sidebar-collapsed') === '1'; } catch { return false; } });
  const [unread, setUnread] = useState(0);

  useEffect(() => { try { localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);

  useEffect(() => {
    const load = () => supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false).then(({ count }) => setUnread(count ?? 0));
    // create any new alerts (payments due, expiries, servicing...) at most once an hour per browser tab
    let last = 0; try { last = Number(sessionStorage.getItem('alerts-checked') ?? 0); } catch { /* ignore */ }
    if (Date.now() - last > 3600_000) {
      supabase.rpc('generate_notifications').then(({ error }) => {
        if (!error) { try { sessionStorage.setItem('alerts-checked', String(Date.now())); } catch { /* ignore */ } }
        load();
      }, load);
    } else load();
    const t = setInterval(load, 60000);
    window.addEventListener('notifications-changed', load);
    return () => { clearInterval(t); window.removeEventListener('notifications-changed', load); };
  }, []);

  const sidebar = (compact: boolean) => (
    <div className="flex flex-col h-full">
      <div className={cn('flex items-center gap-2 h-16 border-b border-white/10', compact ? 'justify-center px-2' : 'px-5')}>
        <Bus className="w-7 h-7 text-mint-400 shrink-0" />
        {!compact && <div className="min-w-0"><p className="font-display font-extrabold text-cream-50 leading-none truncate">{settings.business_name}</p><p className="text-[10px] font-bold text-mint-400 uppercase tracking-wider">Admin</p></div>}
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map(item => (
          <NavLink key={item.to} to={item.to} end={item.end} title={item.label} onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-2xl text-sm font-bold transition', compact ? 'justify-center p-3' : 'px-4 py-2.5',
              isActive ? 'bg-mint-500 text-white shadow-soft' : 'text-ink-300 hover:bg-white/5 hover:text-white')}>
            <item.icon size={18} className="shrink-0" />
            {!compact && item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-1">
        <Link to="/" title="View website" className={cn('flex items-center gap-3 rounded-2xl text-sm font-bold text-ink-300 hover:bg-white/5 hover:text-white transition', compact ? 'justify-center p-3' : 'px-4 py-2.5')}>
          <ArrowLeft size={18} />{!compact && 'View website'}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50 flex">
      <aside className={cn('hidden lg:block shrink-0 bg-ink-900 fixed inset-y-0 left-0 z-40 transition-all', collapsed ? 'w-[72px]' : 'w-64')}>{sidebar(collapsed)}</aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink-900 animate-slide-up">{sidebar(false)}</aside>
        </div>
      )}

      <div className={cn('flex-1 min-w-0 transition-all', collapsed ? 'lg:ml-[72px]' : 'lg:ml-64')}>
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-ink-100 h-16 flex items-center gap-3 px-4 sm:px-6">
          <button className="lg:hidden p-2 rounded-full hover:bg-ink-100" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <button className="hidden lg:block p-2 rounded-full hover:bg-ink-100 text-ink-500" onClick={() => setCollapsed(c => !c)} aria-label="Toggle sidebar">
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/admin/notifications" className="relative p-2 rounded-full hover:bg-ink-100 text-ink-600" aria-label="Notifications">
              <Bell size={20} />
              {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-sunshine-400 text-[10px] font-extrabold text-ink-900 flex items-center justify-center px-1">{unread}</span>}
            </Link>
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-sm font-bold text-ink-900">{profile?.full_name}</p>
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-600">{profile?.role}</p>
            </div>
            <button onClick={async () => { await signOut(); navigate('/login'); }} className="p-2 rounded-full hover:bg-ink-100 text-ink-600" aria-label="Log out" title="Log out"><LogOut size={20} /></button>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto"><Outlet /></main>
      </div>
    </div>
  );
};

export default AdminLayout;
