import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bus, Menu, X, Mail, Phone, MapPin, MessageCircle, UserRound, LogIn, LayoutDashboard } from 'lucide-react';
import { FaFacebookF, FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../contexts/AuthContext';
import { whatsappLink, cn } from '../../lib/utils';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/services', label: 'Services' },
  { to: '/vehicles', label: 'Vehicles' },
  { to: '/school-transport', label: 'School Transport' },
  { to: '/contact', label: 'Contact' },
];

export const BrandMark: React.FC<{ light?: boolean }> = ({ light }) => {
  const { settings } = useSettings();
  return (
    <span className="flex items-center gap-2.5">
      {settings.logo_url
        ? <img src={settings.logo_url} alt="" className="h-10 w-10 rounded-xl object-cover" />
        : <span className="h-10 w-10 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center shadow-md"><Bus size={22} /></span>}
      <span className={cn('font-display text-xl font-extrabold leading-none', light ? 'text-white' : 'text-navy-900')}>{settings.business_name}</span>
    </span>
  );
};

const TopBar: React.FC = () => {
  const { settings } = useSettings();
  if (!settings.phone && !settings.email && !settings.address) return null;
  return (
    <div className="hidden md:block bg-navy-950 text-navy-100 text-xs">
      <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6 min-w-0">
          {settings.phone && <a href={`tel:${settings.phone}`} className="flex items-center gap-1.5 hover:text-white"><Phone size={13} className="text-sunshine-400" />{settings.phone}</a>}
          {settings.email && <a href={`mailto:${settings.email}`} className="flex items-center gap-1.5 hover:text-white truncate"><Mail size={13} className="text-sunshine-400" />{settings.email}</a>}
          {settings.address && <span className="hidden lg:flex items-center gap-1.5 truncate"><MapPin size={13} className="text-sunshine-400" />{settings.address}</span>}
        </div>
        <Link to="/account" className="hover:text-white font-semibold">Parent &amp; customer login</Link>
      </div>
    </div>
  );
};

const Header: React.FC = () => {
  const { authUserId, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [pathname]);

  const account = authUserId
    ? <Link to={isAdmin ? '/admin' : '/account'} className="inline-flex items-center gap-2 rounded-xl border-2 border-navy-200 text-navy-800 hover:bg-navy-50 font-bold text-sm px-4 py-2 transition">{isAdmin ? <LayoutDashboard size={16} /> : <UserRound size={16} />}{isAdmin ? 'Admin' : 'My account'}</Link>
    : <Link to="/account/login" className="inline-flex items-center gap-2 rounded-xl border-2 border-navy-200 text-navy-800 hover:bg-navy-50 font-bold text-sm px-4 py-2 transition"><LogIn size={16} /> Sign in</Link>;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-navy-100">
      <div className="max-w-7xl mx-auto px-4 h-[68px] flex items-center justify-between gap-4">
        <Link to="/" aria-label="Home"><BrandMark /></Link>
        <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn('relative px-3.5 py-2 text-sm font-bold transition rounded-lg', isActive ? 'text-navy-900 after:absolute after:left-3.5 after:right-3.5 after:-bottom-[13px] after:h-[3px] after:rounded-full after:bg-sunshine-400' : 'text-navy-600 hover:text-navy-900 hover:bg-navy-50')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-2">
          {account}
          <Link to="/contact#inquiry" className="rounded-xl bg-sunshine-400 hover:bg-sunshine-300 text-navy-950 font-bold text-sm px-5 py-2.5 shadow-md shadow-sunshine-500/20 transition">Get a quote</Link>
        </div>
        <button className="lg:hidden p-2 rounded-lg hover:bg-navy-50 text-navy-800" onClick={() => setOpen(o => !o)} aria-label="Menu" aria-expanded={open}>
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
      {open && (
        <div className="lg:hidden border-t border-navy-100 bg-white px-4 py-3 space-y-1 animate-slide-up">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn('block px-4 py-3 rounded-xl font-bold', isActive ? 'bg-navy-50 text-navy-900' : 'text-navy-700')}>
              {n.label}
            </NavLink>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
            {account}
            <Link to="/contact#inquiry" className="text-center rounded-xl bg-sunshine-400 text-navy-950 font-bold px-5 py-2.5">Get a quote</Link>
          </div>
        </div>
      )}
    </header>
  );
};

const Footer: React.FC = () => {
  const { settings } = useSettings();
  const s = settings.social;
  const socials = [
    { href: s.facebook, icon: <FaFacebookF />, label: 'Facebook' },
    { href: s.instagram, icon: <FaInstagram />, label: 'Instagram' },
    { href: s.tiktok, icon: <FaTiktok />, label: 'TikTok' },
    { href: s.youtube, icon: <FaYoutube />, label: 'YouTube' },
  ].filter(x => x.href);

  return (
    <footer className="bg-navy-950 text-navy-200 mt-auto">
      <div className="h-1.5 road-dash" aria-hidden />
      <div className="max-w-7xl mx-auto px-4 py-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <BrandMark light />
          <p className="mt-4 text-sm max-w-xs text-navy-300">{settings.tagline}</p>
          {socials.length > 0 && (
            <div className="flex gap-2.5 mt-5">
              {socials.map(x => (
                <a key={x.label} href={x.href} target="_blank" rel="noreferrer" aria-label={x.label}
                  className="h-10 w-10 rounded-lg bg-white/10 hover:bg-sunshine-400 hover:text-navy-950 flex items-center justify-center transition">{x.icon}</a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4 className="font-display font-bold text-white mb-4">Explore</h4>
          <ul className="space-y-2 text-sm">{NAV.map(n => <li key={n.to}><Link to={n.to} className="hover:text-sunshine-300">{n.label}</Link></li>)}</ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-white mb-4">For customers</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/account/login" className="hover:text-sunshine-300">Sign in</Link></li>
            <li><Link to="/account/register" className="hover:text-sunshine-300">Create an account</Link></li>
            <li><Link to="/contact#inquiry" className="hover:text-sunshine-300">Request a quotation</Link></li>
            <li><Link to="/school-transport" className="hover:text-sunshine-300">Register for school transport</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-white mb-4">Contact</h4>
          <ul className="space-y-3 text-sm">
            {settings.phone && <li className="flex gap-2.5"><Phone size={16} className="mt-0.5 text-sunshine-400 shrink-0" /><a href={`tel:${settings.phone}`} className="hover:text-white">{settings.phone}</a></li>}
            {settings.email && <li className="flex gap-2.5"><Mail size={16} className="mt-0.5 text-sunshine-400 shrink-0" /><a href={`mailto:${settings.email}`} className="hover:text-white break-all">{settings.email}</a></li>}
            {settings.address && <li className="flex gap-2.5"><MapPin size={16} className="mt-0.5 text-sunshine-400 shrink-0" /><span>{settings.address}</span></li>}
            {!settings.phone && !settings.email && !settings.address && <li className="text-navy-400">Contact details coming soon.</li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-navy-400">
          <span>© {new Date().getFullYear()} {settings.business_name}. All rights reserved.</span>
          <Link to="/login" className="hover:text-sunshine-300">Staff login</Link>
        </div>
      </div>
    </footer>
  );
};

const WhatsAppFab: React.FC = () => {
  const { settings } = useSettings();
  const href = whatsappLink(settings.whatsapp, `Hello ${settings.business_name}, I would like to enquire about your transport services.`);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" aria-label="Chat on WhatsApp"
      className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl hover:scale-105 transition">
      <MessageCircle size={28} />
    </a>
  );
};

const PublicLayout: React.FC = () => (
  <div className="guest min-h-screen flex flex-col">
    <TopBar />
    <Header />
    <main className="flex-1"><Outlet /></main>
    <Footer />
    <WhatsAppFab />
  </div>
);

export default PublicLayout;
