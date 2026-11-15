import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bus, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Target, Eye, School, CalendarCheck } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { usePublicServices, usePublicVehicles, useSiteContent } from '../lib/queries';
import { whatsappLink } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import InquiryForm from '../components/public/InquiryForm';
import { GridSkeleton, PageHero, SectionTitle, ServiceIcon, VehicleCard } from '../components/public/bits';

// ---------------------------------------------------------------- About
export const About: React.FC = () => {
  const { settings } = useSettings();
  const { content } = useSiteContent();
  const standards = content.about_standards.items;
  return (
    <>
      <PageHero title={`About ${settings.business_name}`} subtitle={settings.tagline} />
      <section className="max-w-4xl mx-auto px-4 py-14">
        <p className="text-lg text-ink-700 leading-relaxed whitespace-pre-line">{settings.about_text}</p>
      </section>
      <section className="max-w-5xl mx-auto px-4 pb-14 grid gap-6 md:grid-cols-2">
        {[{ icon: Target, t: 'Our mission', b: settings.mission }, { icon: Eye, t: 'Our vision', b: settings.vision }].map(x => (
          <div key={x.t} className="rounded-4xl bg-white border border-ink-100 p-8 shadow-soft">
            <div className="w-14 h-14 rounded-3xl bg-sunshine-100 text-sunshine-600 flex items-center justify-center mb-4"><x.icon /></div>
            <h3 className="font-display text-2xl font-bold">{x.t}</h3>
            <p className="text-ink-500 mt-2">{x.b}</p>
          </div>
        ))}
      </section>
      <section className="bg-cream-100">
        <div className="max-w-4xl mx-auto px-4 py-14">
          <SectionTitle title={content.about_standards.title} />
          <ul className="grid gap-3 sm:grid-cols-2">
            {standards.map((s, i) => <li key={i} className="flex gap-3 rounded-3xl bg-white p-4 shadow-soft"><ShieldCheck className="text-mint-600 shrink-0" /><span className="font-semibold text-ink-700">{s}</span></li>)}
          </ul>
        </div>
      </section>
    </>
  );
};

// ------------------------------------------------------------- Services
export const Services: React.FC = () => {
  const services = usePublicServices();
  return (
    <>
      <PageHero title="Our services" subtitle="Reliable transport for schools, families, groups and businesses." />
      <section className="max-w-7xl mx-auto px-4 py-14 space-y-6">
        {services.loading ? <GridSkeleton n={6} /> : services.data.length === 0
          ? <EmptyState title="No services listed yet" message="Please contact us and we will be happy to help." />
          : services.data.map((s, i) => (
            <div key={s.id} id={s.slug} className="rounded-4xl bg-white border border-ink-100 shadow-soft p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start">
              <div className={`w-16 h-16 shrink-0 rounded-3xl flex items-center justify-center ${['bg-mint-100 text-mint-600', 'bg-sunshine-100 text-sunshine-600', 'bg-lavender-100 text-lavender-600', 'bg-peach-100 text-peach-500'][i % 4]}`}><ServiceIcon name={s.icon} size={32} /></div>
              <div className="flex-1">
                <h2 className="font-display text-2xl font-extrabold text-ink-900">{s.title}</h2>
                <p className="text-ink-500 mt-1 font-semibold">{s.summary}</p>
                {s.description && <p className="text-ink-600 mt-3">{s.description}</p>}
              </div>
              <Link to={`/contact?service=${encodeURIComponent(s.title)}#inquiry`}><Button>Request a quote</Button></Link>
            </div>
          ))}
      </section>
    </>
  );
};

// ------------------------------------------------------------- Vehicles
export const Vehicles: React.FC = () => {
  const vehicles = usePublicVehicles();
  return (
    <>
      <PageHero title="Our vehicles" subtitle="Choose the right vehicle for your group size and journey." />
      <section className="max-w-7xl mx-auto px-4 py-14">
        {vehicles.loading ? <GridSkeleton /> : vehicles.data.length === 0
          ? <EmptyState icon={<Bus size={36} strokeWidth={1.5} />} title="Vehicle details coming soon" message="Contact us to find out which vehicles are available for your date." />
          : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{vehicles.data.map(v => <VehicleCard key={v.id} vehicle={v} />)}</div>}
      </section>
    </>
  );
};

// ------------------------------------------------------- School transport
export const SchoolTransport: React.FC = () => {
  const { settings } = useSettings();
  const { content } = useSiteContent();
  const intro = content.school_transport_intro;
  const areas = content.school_service_areas;
  const wa = whatsappLink(settings.whatsapp, `Hello ${settings.business_name}, I would like to enquire about school transport registration.`);
  const STEP_ICONS = [MessageCircle, CalendarCheck, School];
  const steps = content.school_steps.items.map((x, i) => ({ icon: STEP_ICONS[i % STEP_ICONS.length], t: x.title, b: x.text }));
  return (
    <>
      <PageHero title="School transport" subtitle={intro.title} />
      <section className="max-w-4xl mx-auto px-4 py-14">
        <p className="text-lg text-ink-700 leading-relaxed">{intro.body}</p>
        <div className="grid gap-5 sm:grid-cols-3 mt-10">
          {steps.map((s, i) => (
            <div key={i} className="rounded-4xl bg-white border border-ink-100 p-6 shadow-soft text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-mint-100 text-mint-600 flex items-center justify-center mb-3"><s.icon /></div>
              <p className="text-xs font-extrabold text-sunshine-600">STEP {i + 1}</p>
              <h3 className="font-display font-bold text-lg">{s.t}</h3>
              <p className="text-sm text-ink-500">{s.b}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-cream-100">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <h2 className="font-display text-2xl font-extrabold mb-2">{areas.title}</h2>
          <p className="text-ink-600">{areas.body}</p>
          <p className="text-sm text-ink-400 mt-4">We never publish student names, addresses or contact details.</p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link to="/contact?service=School%20transport#inquiry"><Button size="lg">Register an inquiry</Button></Link>
            {wa && <a href={wa} target="_blank" rel="noreferrer"><Button size="lg" variant="outline"><MessageCircle size={18} /> WhatsApp</Button></a>}
          </div>
        </div>
      </section>
    </>
  );
};

// -------------------------------------------------------------- Contact
export const Contact: React.FC = () => {
  const { settings } = useSettings();
  const [params] = useSearchParams();
  return (
    <>
      <PageHero title="Contact us" subtitle="Call, message or send an inquiry — we reply quickly." />
      <section className="max-w-7xl mx-auto px-4 py-14 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-2 space-y-4">
          {[
            { icon: Phone, label: 'Telephone', value: settings.phone, href: settings.phone ? `tel:${settings.phone}` : undefined },
            { icon: MessageCircle, label: 'WhatsApp', value: settings.whatsapp, href: whatsappLink(settings.whatsapp, 'Hello!') ?? undefined },
            { icon: Mail, label: 'Email', value: settings.email, href: settings.email ? `mailto:${settings.email}` : undefined },
            { icon: MapPin, label: 'Address', value: settings.address, href: settings.maps_url ?? undefined },
          ].map(c => (
            <div key={c.label} className="flex gap-4 rounded-3xl bg-white border border-ink-100 p-5 shadow-soft">
              <div className="w-12 h-12 rounded-2xl bg-mint-100 text-mint-600 flex items-center justify-center shrink-0"><c.icon size={22} /></div>
              <div>
                <p className="text-xs font-extrabold uppercase text-ink-400">{c.label}</p>
                {c.value
                  ? (c.href ? <a href={c.href} target={c.label === 'Address' || c.label === 'WhatsApp' ? '_blank' : undefined} rel="noreferrer" className="font-bold text-ink-900 hover:text-mint-600">{c.value}</a> : <p className="font-bold text-ink-900">{c.value}</p>)
                  : <p className="text-ink-400">Not provided yet</p>}
              </div>
            </div>
          ))}
          {settings.maps_url && <a href={settings.maps_url} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full"><MapPin size={18} /> Open in Google Maps</Button></a>}
        </div>
        <div id="inquiry" className="lg:col-span-3 rounded-4xl bg-white border border-ink-100 p-6 sm:p-8 shadow-soft-lg scroll-mt-24">
          <h2 className="font-display text-2xl font-extrabold mb-1">Send an inquiry</h2>
          <p className="text-ink-500 mb-6">Fields marked * are required.</p>
          <InquiryForm key={`${params.get('service')}|${params.get('vehicle')}`} defaultService={params.get('service') ?? undefined} defaultVehicle={params.get('vehicle') ?? undefined} />
        </div>
      </section>
    </>
  );
};
