import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Bus, BadgeCheck, CalendarDays, CheckCircle2, Clock, GraduationCap, Mail, MapPin, MessageCircle, Phone, ShieldCheck, UserRound, Users, Wallet } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { usePublicServices, usePublicVehicles, useSiteContent } from '../lib/queries';
import { whatsappLink } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Field, Input, Select } from '../components/ui/Input';
import InquiryForm, { SERVICE_OPTIONS } from '../components/public/InquiryForm';
import VehicleArt from '../components/public/VehicleArt';
import { GridSkeleton, RoadStrip, SectionTitle, ServiceCard, VehicleCard } from '../components/public/bits';

const WHY_ICONS = [ShieldCheck, Clock, BadgeCheck, Wallet];

/** Quick quote box in the banner: carries the answers over to the full inquiry form. */
const QuoteCard: React.FC = () => {
  const navigate = useNavigate();
  const services = usePublicServices();
  const options = services.data.length ? services.data.map(s => s.title) : SERVICE_OPTIONS;
  const [service, setService] = useState('');
  const [date, setDate] = useState('');
  const [pax, setPax] = useState('');
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (service) q.set('service', service);
    if (date) q.set('date', date);
    if (pax) q.set('passengers', pax);
    navigate(`/contact?${q.toString()}#inquiry`);
  };
  return (
    <form onSubmit={go} className="rounded-2xl bg-white text-navy-900 p-6 shadow-2xl shadow-navy-950/40 space-y-4" aria-label="Quick quote">
      <div><p className="font-display text-xl font-extrabold">Get a free quote</p><p className="text-sm text-slate-500">Tell us about your trip — we reply with a price.</p></div>
      <Field label="What do you need?"><Select value={service} onChange={e => setService(e.target.value)}><option value="">Choose a service…</option>{options.map(o => <option key={o}>{o}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Travel date"><Input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Passengers"><Input type="number" min={1} max={200} value={pax} onChange={e => setPax(e.target.value)} placeholder="e.g. 30" /></Field>
      </div>
      <Button type="submit" variant="amber" size="lg" className="w-full">Continue <ArrowRight size={18} /></Button>
    </form>
  );
};

const Home: React.FC = () => {
  const { settings } = useSettings();
  const { authUserId } = useAuth();
  const services = usePublicServices();
  const vehicles = usePublicVehicles();
  const { content } = useSiteContent();
  const navigate = useNavigate();
  const wa = whatsappLink(settings.whatsapp, `Hello ${settings.business_name}, I would like to enquire about your transport services.`);
  const hero = content.home_hero;
  const why = content.why_choose_us;
  const how = content.hire_steps;
  const chips = why.items.slice(0, 3).map(i => i.title);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 text-white">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-navy-500/20 blur-3xl" aria-hidden />
        <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-sunshine-400/10 blur-3xl" aria-hidden />
        <div className="relative max-w-7xl mx-auto px-4 pt-14 pb-32 sm:pt-20 grid lg:grid-cols-[1.15fr_0.85fr] gap-10 items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-1.5 text-xs font-bold tracking-wide text-sunshine-200 mb-6"><Bus size={14} /> {hero.badge}</span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.05]">{hero.title} <span className="text-sunshine-400">{hero.highlight}</span></h1>
            <p className="mt-5 text-lg text-navy-100 max-w-xl">{hero.body || `${settings.tagline}. Daily school transport and bus, van and tuk tuk hire — with or without a driver.`}</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/contact#inquiry"><Button variant="amber" size="lg">{hero.cta_primary} <ArrowRight size={18} /></Button></Link>
              {wa
                ? <a href={wa} target="_blank" rel="noreferrer"><Button variant="lightOutline" size="lg"><MessageCircle size={18} /> {hero.cta_secondary}</Button></a>
                : <Link to="/services"><Button variant="lightOutline" size="lg">Our services</Button></Link>}
            </div>
            {chips.length > 0 && <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-100">{chips.map(c => <li key={c} className="flex items-center gap-2"><CheckCircle2 size={17} className="text-sunshine-400" />{c}</li>)}</ul>}
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}><QuoteCard /></motion.div>
        </div>
        {/* road with a bus driving along it */}
        <div className="absolute inset-x-0 bottom-0 h-24 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute bottom-3 left-0 w-44 sm:w-56 animate-drive"><VehicleArt kind="bus" className="w-full" /></div>
          <RoadStrip className="h-4 bg-navy-950" />
        </div>
      </section>

      {/* Services */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <SectionTitle eyebrow="What we do" title={content.home_services.title} subtitle={content.home_services.body} />
        {services.loading ? <GridSkeleton n={4} /> : services.data.length === 0
          ? <div className="rounded-2xl border border-dashed border-navy-200 p-10 text-center text-slate-500">Our services will be listed here soon. Please contact us for details.</div>
          : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{services.data.slice(0, 4).map((s, i) => <ServiceCard key={s.id} service={s} index={i} />)}</div>}
        <div className="mt-8"><Link to="/services"><Button variant="navyOutline">View all services <ArrowRight size={16} /></Button></Link></div>
      </section>

      {/* How hiring works */}
      <section className="bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 py-20">
          <SectionTitle center eyebrow="How it works" title={how.title} subtitle={how.body || undefined} />
          <ol className="grid gap-8 md:grid-cols-3 relative">
            {how.items.map((it, i) => (
              <li key={i} className="relative rounded-2xl bg-white border border-navy-100 p-7 shadow-sm">
                <span className="absolute -top-5 left-7 h-10 w-10 rounded-xl bg-navy-800 text-sunshine-400 font-display font-extrabold text-lg flex items-center justify-center shadow-lg">{i + 1}</span>
                <h3 className="font-display text-xl font-bold text-navy-900 mt-3">{it.title}</h3>
                <p className="text-slate-600 mt-2 text-sm leading-relaxed">{it.text}</p>
              </li>))}
          </ol>
        </div>
      </section>

      {/* School transport + parent portal */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-navy-900 to-navy-700 text-white overflow-hidden grid lg:grid-cols-2">
          <div className="p-8 sm:p-12">
            <span className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-sunshine-300"><GraduationCap size={16} /> School transport</span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold mt-3">{content.school_transport_intro.title}</h2>
            <p className="mt-4 text-navy-100 leading-relaxed">{content.school_transport_intro.body}</p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link to="/school-transport"><Button variant="amber">Register your child</Button></Link>
              <Link to={authUserId ? '/account' : '/account/login'}><Button variant="lightOutline">{authUserId ? 'Open my account' : 'Parent sign in'}</Button></Link>
            </div>
          </div>
          <div className="bg-navy-950/40 p-8 sm:p-12 flex flex-col justify-center gap-5">
            <p className="font-display text-xl font-bold">With your online account you can</p>
            {['See your child’s route, pickup points and timings', 'Check monthly fees, payments and balances', 'Download receipts whenever you need them', 'Follow your hires and quotations in one place'].map(t => (
              <p key={t} className="flex gap-3 text-navy-100"><CheckCircle2 size={20} className="text-sunshine-400 shrink-0 mt-0.5" />{t}</p>))}
          </div>
        </div>
      </section>

      {/* Fleet */}
      <section className="bg-navy-50">
        <div className="max-w-7xl mx-auto px-4 py-20">
          <SectionTitle eyebrow="Our fleet" title={content.home_fleet.title} subtitle={content.home_fleet.body} />
          {vehicles.loading ? <GridSkeleton /> : vehicles.data.length === 0
            ? <div className="rounded-2xl border border-dashed border-navy-200 bg-white p-10 text-center"><div className="mx-auto w-56 mb-3"><VehicleArt kind="bus" /></div><p className="font-display font-bold text-navy-900">Fleet details coming soon</p><p className="text-slate-500 text-sm mt-1">Contact us for the vehicles available for your trip.</p><Button className="mt-4" variant="navy" onClick={() => navigate('/contact')}>Contact us</Button></div>
            : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{vehicles.data.slice(0, 3).map(v => <VehicleCard key={v.id} vehicle={v} />)}</div>}
        </div>
      </section>

      {/* Why us */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <SectionTitle center eyebrow="Why choose us" title={why.title} subtitle={why.body || undefined} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {why.items.map((w, i) => { const Icon = WHY_ICONS[i % WHY_ICONS.length]; return (
            <div key={i} className="rounded-2xl border border-navy-100 bg-white p-6 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-sunshine-100 text-navy-800 flex items-center justify-center mb-4"><Icon size={24} /></div>
              <h3 className="font-display font-bold text-lg text-navy-900">{w.title}</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{w.text}</p>
            </div>); })}
        </div>
      </section>

      {/* Call to action */}
      <section className="bg-sunshine-400">
        <div className="max-w-7xl mx-auto px-4 py-10 flex flex-wrap items-center justify-between gap-5">
          <div><p className="font-display text-2xl sm:text-3xl font-extrabold text-navy-950">Ready to book your trip?</p><p className="text-navy-900/80">Call, message or send an inquiry — we reply quickly.</p></div>
          <div className="flex flex-wrap gap-3">
            {settings.phone && <a href={`tel:${settings.phone}`}><Button variant="navy" size="lg"><Phone size={18} /> {settings.phone}</Button></a>}
            {wa && <a href={wa} target="_blank" rel="noreferrer"><Button variant="navyOutline" size="lg" className="bg-white/60"><MessageCircle size={18} /> WhatsApp</Button></a>}
            {!settings.phone && !wa && <Link to="/contact#inquiry"><Button variant="navy" size="lg">Send an inquiry</Button></Link>}
          </div>
        </div>
      </section>

      {/* Inquiry + contact */}
      <section id="inquiry" className="bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 py-20 grid lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <SectionTitle eyebrow="Get in touch" title="Request a quotation" subtitle="Tell us about your trip and we will get back to you with a price." />
            <ul className="space-y-4 text-slate-700">
              {settings.phone && <li className="flex gap-3 items-center"><span className="h-11 w-11 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center"><Phone size={20} /></span><a href={`tel:${settings.phone}`} className="font-bold">{settings.phone}</a></li>}
              {settings.email && <li className="flex gap-3 items-center"><span className="h-11 w-11 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center"><Mail size={20} /></span><a href={`mailto:${settings.email}`} className="font-bold break-all">{settings.email}</a></li>}
              {settings.address && <li className="flex gap-3 items-center"><span className="h-11 w-11 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center"><MapPin size={20} /></span><span>{settings.address}</span></li>}
              <li className="flex gap-3 items-center text-sm text-slate-500"><span className="h-11 w-11 rounded-xl bg-navy-50 text-navy-600 flex items-center justify-center"><UserRound size={20} /></span><span>Already a customer? <Link to="/account/login" className="font-bold text-navy-700 underline">Sign in to your account</Link></span></li>
              <li className="flex gap-3 items-center text-sm text-slate-500"><span className="h-11 w-11 rounded-xl bg-navy-50 text-navy-600 flex items-center justify-center"><Users size={20} /></span><span>Travelling in a group? Tell us the number of passengers so we can match the right vehicle.</span></li>
              <li className="flex gap-3 items-center text-sm text-slate-500"><span className="h-11 w-11 rounded-xl bg-navy-50 text-navy-600 flex items-center justify-center"><CalendarDays size={20} /></span><span>Book early for weddings, tours and holiday dates.</span></li>
            </ul>
          </div>
          <div className="lg:col-span-3 rounded-2xl bg-white p-6 sm:p-8 shadow-xl shadow-navy-900/10 border border-navy-100"><InquiryForm /></div>
        </div>
      </section>
    </>
  );
};

export default Home;
