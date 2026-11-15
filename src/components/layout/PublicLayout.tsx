import React, { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bus, Menu, X, Mail, Phone, MapPin, MessageCircle, Lock } from 'lucide-react';
import { FaFacebookF, FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa';
import { useSettings } from '../../contexts/SettingsContext';
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
    <span className="flex items-center gap-2">
      {settings.logo_url
        ? <img src={settings.logo_url} alt="" className="h-9 w-9 rounded-xl object-cover" />
        : <span className="h-9 w-9 rounded-2xl bg-mint-500 flex items-center justify-center text-white shadow-soft"><Bus size={20} /></span>}
      <span className={cn('font-display text-xl font-extrabold leading-none', light ? 'text-cream-50' : 'text-ink-900')}>{settings.business_name}</span>
    </span>
  );
};

const Header: React.FC = () => {
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [pathname]);

  return (
    <header className="sticky top-0 z-40 bg-cream-50/90 backdrop-blur border-b border-ink-100">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" aria-label="Home"><BrandMark /></Link>
        <nav className="hidden lg:flex items-center gap-1">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn('px-4 py-2 rounded-full text-sm font-bold transition', isActive ? 'bg-mint-100 text-mint-700' : 'text-ink-600 hover:bg-ink-100')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-2">
          {settings.phone && <a href={`tel:${settings.phone}`} className="flex items-center gap-2 text-sm font-bold text-ink-700 px-3"><Phone size={16} className="text-mint-600" />{settings.phone}</a>}
          <Link to="/contact#inquiry" className="rounded-full bg-sunshine-400 hover:bg-sunshine-300 text-ink-900 font-bold text-sm px-5 py-2.5 shadow-playful transition">Get a Quote</Link>
        </div>
        <button className="lg:hidden p-2 rounded-full hover:bg-ink-100" onClick={() => setOpen(o => !o)} aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="lg:hidden border-t border-ink-100 bg-cream-50 px-4 py-3 space-y-1 animate-slide-up">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn('block px-4 py-3 rounded-2xl font-bold', isActive ? 'bg-mint-100 text-mint-700' : 'text-ink-700')}>
              {n.label}
            </NavLink>
          ))}
          <Link to="/contact#inquiry" className="block text-center rounded-full bg-sunshine-400 text-ink-900 font-bold px-5 py-3 mt-2">Get a Quote</Link>
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
    <footer className="bg-ink-900 text-ink-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-12 grid gap-10 md:grid-cols-3">
        <div>
          <BrandMark light />
          <p className="mt-4 text-sm max-w-xs">{settings.tagline}</p>
          {socials.length > 0 && (
            <div className="flex gap-3 mt-5">
              {socials.map(x => (
                <a key={x.label} href={x.href} target="_blank" rel="noreferrer" aria-label={x.label}
                  className="h-10 w-10 rounded-full bg-white/10 hover:bg-mint-500 hover:text-white flex items-center justify-center transition">{x.icon}</a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4 className="font-display font-bold text-cream-50 mb-4">Explore</h4>
          <ul className="space-y-2 text-sm">
            {NAV.map(n => <li key={n.to}><Link to={n.to} className="hover:text-mint-300">{n.label}</Link></li>)}
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold text-cream-50 mb-4">Contact</h4>
          <ul className="space-y-3 text-sm">
            {settings.phone && <li className="flex gap-2"><Phone size={16} className="mt-0.5 text-mint-400" /><a href={`tel:${settings.phone}`}>{settings.phone}</a></li>}
            {settings.email && <li className="flex gap-2"><Mail size={16} className="mt-0.5 text-mint-400" /><a href={`mailto:${settings.email}`}>{settings.email}</a></li>}
            {settings.address && <li className="flex gap-2"><MapPin size={16} className="mt-0.5 text-mint-400" /><span>{settings.address}</span></li>}
            {!settings.phone && !settings.email && !settings.address && <li className="text-ink-400">Contact details coming soon.</li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
          <span>© {new Date().getFullYear()} {settings.business_name}. All rights reserved.</span>
          <Link to="/login" className="inline-flex items-center gap-1 hover:text-mint-300"><Lock size={12} /> Staff login</Link>
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
      className="fixed bottom-5 right-5 z-40 h-14 w-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-soft-lg hover:scale-105 transition">
      <MessageCircle size={28} />
    </a>
  );
};

const PublicLayout: React.FC = () => (
  <div className="min-h-screen flex flex-col">
    <Header />
    <main className="flex-1"><Outlet /></main>
    <Footer />
    <WhatsAppFab />
  </div>
);

export default PublicLayout;
