import React from 'react';
import { Link } from 'react-router-dom';
import { Bus, CarFront, Bike, GraduationCap, MapPinned, UserRoundCheck, KeyRound, Truck, Users, Fuel } from 'lucide-react';
import { motion } from 'framer-motion';
import type { PublicVehicle, Service } from '../../lib/supabase';
import { cn } from '../../lib/utils';

const ICONS: Record<string, React.ElementType> = {
  'graduation-cap': GraduationCap, bus: Bus, 'car-front': CarFront, bike: Bike,
  'map-pinned': MapPinned, 'user-round-check': UserRoundCheck, 'key-round': KeyRound,
};
export const ServiceIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 28 }) => {
  const I = ICONS[name] ?? Truck;
  return <I size={size} strokeWidth={1.8} />;
};

const TONES = ['bg-mint-100 text-mint-600', 'bg-sunshine-100 text-sunshine-600', 'bg-lavender-100 text-lavender-600', 'bg-peach-100 text-peach-500'];

export const SectionTitle: React.FC<{ eyebrow?: string; title: string; subtitle?: string; center?: boolean }> = ({ eyebrow, title, subtitle, center }) => (
  <div className={cn('mb-10', center && 'text-center')}>
    {eyebrow && <span className="inline-block rounded-full bg-mint-100 text-mint-700 text-xs font-extrabold uppercase tracking-wider px-3 py-1 mb-3">{eyebrow}</span>}
    <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-ink-900">{title}</h2>
    {subtitle && <p className={cn('text-ink-500 mt-2 max-w-2xl', center && 'mx-auto')}>{subtitle}</p>}
  </div>
);

export const PageHero: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <section className="relative overflow-hidden bg-gradient-to-br from-mint-400 via-mint-300 to-sunshine-200">
    <div className="absolute inset-0 bg-dots opacity-30" />
    <div className="relative max-w-7xl mx-auto px-4 py-14 sm:py-20">
      <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display text-4xl sm:text-5xl font-extrabold text-ink-900">{title}</motion.h1>
      {subtitle && <p className="mt-3 text-lg text-ink-800/80 max-w-2xl">{subtitle}</p>}
    </div>
  </section>
);

export const ServiceCard: React.FC<{ service: Service; index: number }> = ({ service, index }) => (
  <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (index % 4) * 0.05 }}
    className="rounded-4xl border border-ink-100 bg-white p-6 shadow-soft hover:shadow-soft-lg hover:-translate-y-1 transition">
    <div className={cn('w-14 h-14 rounded-3xl flex items-center justify-center mb-4', TONES[index % TONES.length])}><ServiceIcon name={service.icon} /></div>
    <h3 className="font-display text-xl font-bold text-ink-900">{service.title}</h3>
    <p className="text-ink-500 mt-1.5 text-sm">{service.summary}</p>
    <Link to={`/contact?service=${encodeURIComponent(service.title)}#inquiry`} className="inline-block mt-4 text-sm font-bold text-mint-600 hover:text-mint-700">Request a quote →</Link>
  </motion.div>
);

const TYPE_LABEL: Record<string, string> = { bus: 'Bus', van: 'Van', three_wheeler: 'Tuk Tuk', other: 'Vehicle' };

export const VehicleCard: React.FC<{ vehicle: PublicVehicle }> = ({ vehicle }) => (
  <div className="rounded-4xl border border-ink-100 bg-white overflow-hidden shadow-soft hover:shadow-soft-lg transition flex flex-col">
    <div className="aspect-[16/10] bg-gradient-to-br from-mint-100 via-cream-100 to-lavender-100 flex items-center justify-center">
      {vehicle.image_url
        ? <img src={vehicle.image_url} alt={vehicle.title} className="w-full h-full object-cover" loading="lazy" />
        : <Bus size={64} className="text-mint-500/60" strokeWidth={1.4} />}
    </div>
    <div className="p-5 flex-1 flex flex-col">
      <span className="text-xs font-extrabold uppercase tracking-wide text-mint-600">{TYPE_LABEL[vehicle.vehicle_type]}</span>
      <h3 className="font-display text-xl font-bold text-ink-900">{vehicle.title}</h3>
      <div className="flex gap-4 text-sm text-ink-500 mt-2">
        <span className="flex items-center gap-1"><Users size={15} />{vehicle.seating_capacity} seats</span>
        <span className="flex items-center gap-1 capitalize"><Fuel size={15} />{vehicle.fuel_type}</span>
      </div>
      {vehicle.description && <p className="text-sm text-ink-500 mt-3">{vehicle.description}</p>}
      {vehicle.specs && <p className="text-xs text-ink-400 mt-2">{vehicle.specs}</p>}
      {vehicle.hire_info && <p className="text-xs font-semibold text-sunshine-700 mt-2">{vehicle.hire_info}</p>}
      <Link to={`/contact?service=${encodeURIComponent(TYPE_LABEL[vehicle.vehicle_type] + ' hire')}&vehicle=${encodeURIComponent(vehicle.title)}#inquiry`}
        className="mt-auto pt-4 text-sm font-bold text-mint-600 hover:text-mint-700">Contact for quotation →</Link>
    </div>
  </div>
);

export const GridSkeleton: React.FC<{ n?: number }> = ({ n = 3 }) => (
  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
    {Array.from({ length: n }).map((_, i) => <div key={i} className="h-56 animate-pulse rounded-4xl bg-ink-100" />)}
  </div>
);
