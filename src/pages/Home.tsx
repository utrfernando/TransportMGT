import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Bus, ShieldCheck, Clock, BadgeCheck, Wallet, MessageCircle, Phone, Mail, MapPin } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { usePublicServices, usePublicVehicles, useWebsiteContent } from '../lib/queries';
import { whatsappLink } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import InquiryForm from '../components/public/InquiryForm';
import { GridSkeleton, SectionTitle, ServiceCard, VehicleCard } from '../components/public/bits';

const WHY = [
  { icon: ShieldCheck, title: 'Safety first', text: 'Well-maintained vehicles with valid insurance and licences.' },
  { icon: Clock, title: 'Always punctual', text: 'Fixed schedules for school runs and on-time hires.' },
  { icon: BadgeCheck, title: 'Experienced drivers', text: 'Courteous, professional drivers you can rely on.' },
  { icon: Wallet, title: 'Fair pricing', text: 'Clear quotations with no hidden charges.' },
];

const Home: React.FC = () => {
  const { settings } = useSettings();
  const services = usePublicServices();
  const vehicles = usePublicVehicles();
  const content = useWebsiteContent();
  const wa = whatsappLink(settings.whatsapp, `Hello ${settings.business_name}, I would like to enquire about your transport services.`);
  const why = content.data.why_choose_us;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-mint-400 via-mint-300 to-sunshine-200">
        <div className="absolute inset-0 bg-dots opacity-30" />
        <div className="relative max-w-7xl mx-auto px-4 py-16 sm:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <span className="inline-block rounded-full bg-white/60 backdrop-blur px-4 py-1 text-xs font-extrabold text-mint-700 mb-5">Schools · Tours · Private hires</span>
            <h1 className="font-display text-4xl sm:text-6xl font-extrabold text-ink-900 leading-[1.05]">
              Safe rides for <span className="text-sunshine-600">every journey</span>
            </h1>
            <p className="mt-5 text-lg text-ink-800/80 max-w-lg">{settings.tagline}. Daily school transport and bus, van and tuk tuk hire — with or without a driver.</p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/contact#inquiry"><Button variant="sunshine" size="lg">Get a Quote <ArrowRight size={18} /></Button></Link>
              {wa
                ? <a href={wa} target="_blank" rel="noreferrer"><Button variant="secondary" size="lg"><MessageCircle size={18} /> WhatsApp us</Button></a>
                : <Link to="/services"><Button variant="secondary" size="lg">Our services</Button></Link>}
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} className="hidden lg:grid grid-cols-2 gap-4">
            {[Bus, ShieldCheck, Clock, BadgeCheck].map((I, i) => (
              <div key={i} className={`aspect-square rounded-4xl backdrop-blur flex items-center justify-center shadow-soft ${['bg-white/40', 'bg-mint-200/60', 'bg-sunshine-200/70', 'bg-white/40'][i]} ${i % 2 ? 'translate-y-6' : ''}`}>
                <I size={64} className="text-mint-700/70 animate-float" strokeWidth={1.3} />
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Services */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <SectionTitle eyebrow="What we do" title="Our services" subtitle="From the daily school run to a full-day tour, we have a vehicle and a driver for it." />
        {services.loading ? <GridSkeleton n={4} /> : services.data.length === 0
          ? <EmptyState title="Services coming soon" message="Please contact us for details." />
          : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{services.data.slice(0, 4).map((s, i) => <ServiceCard key={s.id} service={s} index={i} />)}</div>}
        <div className="text-center mt-8"><Link to="/services"><Button variant="outline">View all services</Button></Link></div>
      </section>

      {/* Featured vehicles */}
      <section className="bg-cream-100">
        <div className="max-w-7xl mx-auto px-4 py-16">
          <SectionTitle eyebrow="Our fleet" title="Featured vehicles" subtitle="Clean, comfortable and regularly serviced." />
          {vehicles.loading ? <GridSkeleton /> : vehicles.data.length === 0
            ? <EmptyState icon={<Bus size={36} strokeWidth={1.5} />} title="Fleet details coming soon" message="Contact us for the vehicles available for your trip." actionLabel="Contact us" onAction={() => { window.location.href = '/contact'; }} />
            : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{vehicles.data.slice(0, 3).map(v => <VehicleCard key={v.id} vehicle={v} />)}</div>}
        </div>
      </section>

      {/* Why us */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <SectionTitle center eyebrow="Why choose us" title={why?.title ?? 'Why choose us'} subtitle={why?.body ?? undefined} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map(w => (
            <div key={w.title} className="text-center rounded-4xl bg-white border border-ink-100 p-6 shadow-soft">
              <div className="mx-auto w-14 h-14 rounded-full bg-mint-100 text-mint-600 flex items-center justify-center mb-4"><w.icon size={26} /></div>
              <h3 className="font-display font-bold text-lg text-ink-900">{w.title}</h3>
              <p className="text-sm text-ink-500 mt-1">{w.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Inquiry + contact */}
      <section id="inquiry" className="bg-gradient-to-br from-mint-50 to-sunshine-50">
        <div className="max-w-7xl mx-auto px-4 py-16 grid lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2">
            <SectionTitle eyebrow="Get in touch" title="Request a quotation" subtitle="Tell us about your trip and we will get back to you with a price." />
            <ul className="space-y-4 text-ink-700">
              {settings.phone && <li className="flex gap-3"><Phone className="text-mint-600" /><a href={`tel:${settings.phone}`} className="font-bold">{settings.phone}</a></li>}
              {settings.email && <li className="flex gap-3"><Mail className="text-mint-600" /><a href={`mailto:${settings.email}`} className="font-bold">{settings.email}</a></li>}
              {settings.address && <li className="flex gap-3"><MapPin className="text-mint-600" /><span>{settings.address}</span></li>}
            </ul>
          </div>
          <div className="lg:col-span-3 rounded-4xl bg-white p-6 sm:p-8 shadow-soft-lg"><InquiryForm /></div>
        </div>
      </section>
    </>
  );
};

export default Home;
