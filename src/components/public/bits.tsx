import React from 'react';
import { Link } from 'react-router-dom';
import { CarFront, Bike, Bus, GraduationCap, MapPinned, UserRoundCheck, KeyRound, Truck, Users, Fuel, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type { PublicVehicle, Service } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import VehicleArt from './VehicleArt';

const ICONS: Record<string, React.ElementType> = {
  'graduation-cap': GraduationCap, bus: Bus, 'car-front': CarFront, bike: Bike,
  'map-pinned': MapPinned, 'user-round-check': UserRoundCheck, 'key-round': KeyRound,
};
export const ServiceIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 28 }) => {
  const I = ICONS[name] ?? Truck;
  return <I size={size} strokeWidth={1.8} />;
};

export const SectionTitle: React.FC<{ eyebrow?: string; title: string; subtitle?: string; center?: boolean; light?: boolean }> = ({ eyebrow, title, subtitle, center, light }) => (
  <div className={cn('mb-10', center && 'text-center')}>
    {eyebrow && <span className={cn('inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] mb-3', light ? 'text-sunshine-300' : 'text-navy-500')}><span className="h-[3px] w-6 rounded-full bg-sunshine-400" />{eyebrow}</span>}
    <h2 className={cn('font-display text-3xl sm:text-4xl font-extrabold', light ? 'text-white' : 'text-navy-900')}>{title}</h2>
    {subtitle && <p className={cn('mt-3 max-w-2xl text-base sm:text-lg', center && 'mx-auto', light ? 'text-navy-200' : 'text-slate-600')}>{subtitle}</p>}
  </div>
);

/** The dashed road that runs under the page banners. */
export const RoadStrip: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('absolute inset-x-0 bottom-0 h-5 bg-navy-950/70', className)} aria-hidden>
    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] road-dash opacity-90" />
  </div>
);

export const PageHero: React.FC<{ title: string; subtitle?: string; crumb?: string }> = ({ title, subtitle, crumb }) => (
  <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 text-white">
    <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-sunshine-400/10 blur-2xl" aria-hidden />
    <div className="relative max-w-7xl mx-auto px-4 pt-14 pb-20 sm:pt-20 sm:pb-24">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-sunshine-300 mb-3"><Link to="/" className="hover:text-white">Home</Link> <span className="mx-1.5 opacity-60">/</span> {crumb ?? title}</p>
      <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display text-4xl sm:text-5xl font-extrabold">{title}</motion.h1>
      {subtitle && <p className="mt-3 text-lg text-navy-100 max-w-2xl">{subtitle}</p>}
    </div>
    <RoadStrip />
  </section>
);

export const ServiceCard: React.FC<{ service: Service; index: number }> = ({ service, index }) => (
  <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (index % 4) * 0.05 }}
    className="group relative rounded-2xl border border-navy-100 bg-white p-6 shadow-sm hover:shadow-xl hover:shadow-navy-900/10 hover:-translate-y-1 transition overflow-hidden">
    <span className="absolute inset-x-0 top-0 h-1 bg-sunshine-400 scale-x-0 group-hover:scale-x-100 origin-left transition-transform" aria-hidden />
    <div className="w-14 h-14 rounded-xl bg-navy-800 text-sunshine-400 flex items-center justify-center mb-5"><ServiceIcon name={service.icon} /></div>
    <h3 className="font-display text-xl font-bold text-navy-900">{service.title}</h3>
    <p className="text-slate-600 mt-2 text-sm leading-relaxed">{service.summary}</p>
    <Link to={`/contact?service=${encodeURIComponent(service.title)}#inquiry`} className="inline-flex items-center gap-1.5 mt-5 text-sm font-bold text-navy-700 hover:text-navy-900">Request a quote <ArrowRight size={15} className="group-hover:translate-x-0.5 transition" /></Link>
  </motion.div>
);

const TYPE_LABEL: Record<string, string> = { bus: 'Bus', van: 'Van', three_wheeler: 'Tuk Tuk', other: 'Vehicle' };

export const VehicleCard: React.FC<{ vehicle: PublicVehicle }> = ({ vehicle }) => (
  <div className="rounded-2xl border border-navy-100 bg-white overflow-hidden shadow-sm hover:shadow-xl hover:shadow-navy-900/10 transition flex flex-col">
    <div className="aspect-[16/10] bg-gradient-to-b from-navy-50 to-navy-100 flex items-end justify-center overflow-hidden">
      {vehicle.image_url
        ? <img src={vehicle.image_url} alt={vehicle.title} className="w-full h-full object-cover" loading="lazy" />
        : <VehicleArt kind={vehicle.vehicle_type} className="w-[82%] pb-3" />}
    </div>
    <div className="p-5 flex-1 flex flex-col">
      <span className="inline-block self-start rounded-md bg-navy-800 text-sunshine-300 text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5">{TYPE_LABEL[vehicle.vehicle_type]}</span>
      <h3 className="font-display text-xl font-bold text-navy-900 mt-2">{vehicle.title}</h3>
      <div className="flex gap-4 text-sm text-slate-600 mt-2">
        <span className="flex items-center gap-1.5"><Users size={15} className="text-navy-500" />{vehicle.seating_capacity} seats</span>
        <span className="flex items-center gap-1.5 capitalize"><Fuel size={15} className="text-navy-500" />{vehicle.fuel_type}</span>
      </div>
      {vehicle.description && <p className="text-sm text-slate-600 mt-3">{vehicle.description}</p>}
      {vehicle.specs && <p className="text-xs text-slate-500 mt-2">{vehicle.specs}</p>}
      {vehicle.hire_info && <p className="text-xs font-semibold text-sunshine-700 mt-2">{vehicle.hire_info}</p>}
      <Link to={`/contact?service=${encodeURIComponent(TYPE_LABEL[vehicle.vehicle_type] + ' hire')}&vehicle=${encodeURIComponent(vehicle.title)}#inquiry`}
        className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-bold text-navy-700 hover:text-navy-900">Contact for quotation <ArrowRight size={15} /></Link>
    </div>
  </div>
);

export const GridSkeleton: React.FC<{ n?: number }> = ({ n = 3 }) => (
  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: n }).map((_, i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-navy-50" />)}
  </div>
);
