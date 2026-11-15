import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, Mail, MapPin, MessageCircle, Phone, Target, UserRound } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { usePublicServices, usePublicVehicles, useSiteContent } from '../lib/queries';
import { whatsappLink } from '../lib/utils';
import { Button } from '../components/ui/Button';
import InquiryForm from '../components/public/InquiryForm';
import VehicleArt from '../components/public/VehicleArt';
import { GridSkeleton, PageHero, SectionTitle, ServiceIcon, VehicleCard } from '../components/public/bits';

const Empty: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div className="rounded-2xl border border-dashed border-navy-200 bg-white p-12 text-center">
    <div className="mx-auto w-56 mb-4"><VehicleArt kind="bus" /></div>
    <p className="font-display text-xl font-bold text-navy-900">{title}</p><p className="text-slate-500 mt-1">{message}</p>
  </div>
);

// ---------------------------------------------------------------- About
export const About: React.FC = () => {
  const { settings } = useSettings();
  const { content } = useSiteContent();
  return (
    <>
      <PageHero title={`About ${settings.business_name}`} subtitle={settings.tagline} crumb="About" />
      <section className="max-w-4xl mx-auto px-4 py-16">
        <p className="text-lg text-slate-700 leading-relaxed whitespace-pre-line">{settings.about_text}</p>
      </section>
      <section className="max-w-5xl mx-auto px-4 pb-16 grid gap-6 md:grid-cols-2">
        {[{ icon: Target, t: 'Our mission', b: settings.mission }, { icon: Eye, t: 'Our vision', b: settings.vision }].map(x => (
          <div key={x.t} className="rounded-2xl bg-white border border-navy-100 p-8 shadow-sm">
            <div className="w-14 h-14 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center mb-4"><x.icon /></div>
            <h3 className="font-display text-2xl font-bold text-navy-900">{x.t}</h3>
            <p className="text-slate-600 mt-2">{x.b}</p>
          </div>
        ))}
      </section>
      <section className="bg-navy-50">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <SectionTitle title={content.about_standards.title} />
          <ul className="grid gap-3 sm:grid-cols-2">
            {content.about_standards.items.map((s, i) => <li key={i} className="flex gap-3 rounded-xl bg-white border border-navy-100 p-4"><CheckCircle2 className="text-sunshine-500 shrink-0" /><span className="font-semibold text-navy-800">{s}</span></li>)}
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
      <PageHero title="Our services" subtitle="Reliable transport for schools, families, groups and businesses." crumb="Services" />
      <section className="max-w-7xl mx-auto px-4 py-16 space-y-5">
        {services.loading ? <GridSkeleton n={6} /> : services.data.length === 0
          ? <Empty title="Services coming soon" message="Please contact us and we will be happy to help." />
          : services.data.map(s => (
            <div key={s.id} id={s.slug} className="rounded-2xl bg-white border border-navy-100 shadow-sm hover:shadow-lg hover:shadow-navy-900/5 transition p-6 sm:p-8 flex flex-col sm:flex-row gap-6 items-start scroll-mt-24">
              <div className="w-16 h-16 shrink-0 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center"><ServiceIcon name={s.icon} size={32} /></div>
              <div className="flex-1">
                <h2 className="font-display text-2xl font-extrabold text-navy-900">{s.title}</h2>
                <p className="text-navy-600 mt-1 font-semibold">{s.summary}</p>
                {s.description && <p className="text-slate-600 mt-3 leading-relaxed">{s.description}</p>}
              </div>
              <Link to={`/contact?service=${encodeURIComponent(s.title)}#inquiry`}><Button variant="navy">Request a quote <ArrowRight size={16} /></Button></Link>
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
      <PageHero title="Our vehicles" subtitle="Choose the right vehicle for your group size and journey." crumb="Vehicles" />
      <section className="max-w-7xl mx-auto px-4 py-16">
        {vehicles.loading ? <GridSkeleton /> : vehicles.data.length === 0
          ? <Empty title="Vehicle details coming soon" message="Contact us to find out which vehicles are available for your date." />
          : <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{vehicles.data.map(v => <VehicleCard key={v.id} vehicle={v} />)}</div>}
      </section>
    </>
  );
};

// ------------------------------------------------------- School transport
export const SchoolTransport: React.FC = () => {
  const { settings } = useSettings();
  const { authUserId } = useAuth();
  const { content } = useSiteContent();
  const intro = content.school_transport_intro;
  const areas = content.school_service_areas;
  const wa = whatsappLink(settings.whatsapp, `Hello ${settings.business_name}, I would like to enquire about school transport registration.`);
  const steps = content.school_steps.items;
  return (
    <>
      <PageHero title="School transport" subtitle={intro.title} crumb="School transport" />
      <section className="max-w-5xl mx-auto px-4 py-16">
        <p className="text-lg text-slate-700 leading-relaxed">{intro.body}</p>
        <div className="grid gap-6 sm:grid-cols-3 mt-12">
          {steps.map((s, i) => (
            <div key={i} className="relative rounded-2xl bg-white border border-navy-100 p-6 pt-8 shadow-sm">
              <span className="absolute -top-5 left-6 h-10 w-10 rounded-xl bg-navy-800 text-sunshine-400 font-display font-extrabold flex items-center justify-center shadow-lg">{i + 1}</span>
              <h3 className="font-display font-bold text-lg text-navy-900">{s.title}</h3>
              <p className="text-sm text-slate-600 mt-1.5">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-navy-50">
        <div className="max-w-5xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="font-display text-2xl font-extrabold text-navy-900 mb-2">{areas.title}</h2>
            <p className="text-slate-700 whitespace-pre-line">{areas.body}</p>
            <p className="text-sm text-slate-500 mt-4">We never publish student names, addresses or contact details.</p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link to="/contact?service=School%20Transport#inquiry"><Button variant="navy" size="lg">Register an inquiry</Button></Link>
              {wa && <a href={wa} target="_blank" rel="noreferrer"><Button size="lg" variant="navyOutline"><MessageCircle size={18} /> WhatsApp</Button></a>}
            </div>
          </div>
          <div className="rounded-2xl bg-navy-900 text-white p-7">
            <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-white/10 text-sunshine-400 flex items-center justify-center"><UserRound size={22} /></span><p className="font-display text-lg font-bold">Already registered?</p></div>
            <p className="text-navy-100 mt-3 text-sm leading-relaxed">Sign in to see your child’s route and pickup times, monthly fees, payments and receipts. We give you a one-time access code when your child joins.</p>
            <Link to={authUserId ? '/account' : '/account/login'}><Button className="mt-5" variant="amber">{authUserId ? 'Open my account' : 'Sign in'}</Button></Link>
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
      <PageHero title="Contact us" subtitle="Call, message or send an inquiry — we reply quickly." crumb="Contact" />
      <section className="max-w-7xl mx-auto px-4 py-16 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-2 space-y-4">
          {[
            { icon: Phone, label: 'Telephone', value: settings.phone, href: settings.phone ? `tel:${settings.phone}` : undefined },
            { icon: MessageCircle, label: 'WhatsApp', value: settings.whatsapp, href: whatsappLink(settings.whatsapp, 'Hello!') ?? undefined },
            { icon: Mail, label: 'Email', value: settings.email, href: settings.email ? `mailto:${settings.email}` : undefined },
            { icon: MapPin, label: 'Address', value: settings.address, href: settings.maps_url ?? undefined },
          ].map(c => (
            <div key={c.label} className="flex gap-4 rounded-2xl bg-white border border-navy-100 p-5 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center shrink-0"><c.icon size={22} /></div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">{c.label}</p>
                {c.value
                  ? (c.href ? <a href={c.href} target={c.label === 'Address' || c.label === 'WhatsApp' ? '_blank' : undefined} rel="noreferrer" className="font-bold text-navy-900 hover:text-navy-600 break-words">{c.value}</a> : <p className="font-bold text-navy-900">{c.value}</p>)
                  : <p className="text-slate-400">Not provided yet</p>}
              </div>
            </div>
          ))}
          {settings.maps_url && <a href={settings.maps_url} target="_blank" rel="noreferrer"><Button variant="navyOutline" className="w-full"><MapPin size={18} /> Open in Google Maps</Button></a>}
        </div>
        <div id="inquiry" className="lg:col-span-3 rounded-2xl bg-white border border-navy-100 p-6 sm:p-8 shadow-xl shadow-navy-900/10 scroll-mt-24">
          <h2 className="font-display text-2xl font-extrabold text-navy-900 mb-1">Send an inquiry</h2>
          <p className="text-slate-500 mb-6">Fields marked * are required.</p>
          <InquiryForm key={`${params.get('service')}|${params.get('vehicle')}|${params.get('date')}|${params.get('passengers')}`}
            defaultService={params.get('service') ?? undefined} defaultVehicle={params.get('vehicle') ?? undefined}
            defaultDate={params.get('date') ?? undefined} defaultPassengers={params.get('passengers') ?? undefined} />
        </div>
      </section>
    </>
  );
};
