import type { WebsiteContent } from './supabase';

/**
 * Editable text of the public website. Everything here can be changed from Admin → Website;
 * the values below are only the defaults used until the business edits them (or if the database is unreachable).
 * Stored in the `website_content` table, one row per `key`.
 */
export interface Item { title: string; text: string }
export interface SiteContent {
  home_hero: { badge: string; title: string; highlight: string; body: string; cta_primary: string; cta_secondary: string };
  home_services: { title: string; body: string };
  home_fleet: { title: string; body: string };
  why_choose_us: { title: string; body: string; items: Item[] };
  about_standards: { title: string; items: string[] };
  school_transport_intro: { title: string; body: string };
  school_service_areas: { title: string; body: string };
  school_steps: { items: Item[] };
}
export type ContentKey = keyof SiteContent;

export const DEFAULT_CONTENT: SiteContent = {
  home_hero: {
    badge: 'Schools · Tours · Private hires', title: 'Safe rides for', highlight: 'every journey',
    body: '', // empty = use "<tagline>. Daily school transport and bus, van and tuk tuk hire — with or without a driver."
    cta_primary: 'Get a Quote', cta_secondary: 'WhatsApp us',
  },
  home_services: { title: 'Our services', body: 'From the daily school run to a full-day tour, we have a vehicle and a driver for it.' },
  home_fleet: { title: 'Featured vehicles', body: 'Clean, comfortable and regularly serviced.' },
  why_choose_us: {
    title: 'Why choose us', body: 'Experienced drivers, well-maintained vehicles and transparent pricing.',
    items: [
      { title: 'Safety first', text: 'Well-maintained vehicles with valid insurance and licences.' },
      { title: 'Always punctual', text: 'Fixed schedules for school runs and on-time hires.' },
      { title: 'Experienced drivers', text: 'Courteous, professional drivers you can rely on.' },
      { title: 'Fair pricing', text: 'Clear quotations with no hidden charges.' },
    ],
  },
  about_standards: {
    title: 'Our service standards',
    items: ['Vehicles serviced regularly and kept clean', 'Valid insurance, revenue licences and emission certificates', 'Courteous, licensed drivers', 'Transparent quotations and monthly school billing', 'Strict privacy for every student record'],
  },
  school_transport_intro: { title: 'School transport you can trust', body: 'We collect and drop students on fixed, well-planned routes. Fees are billed monthly per student. Student information is kept strictly private.' },
  school_service_areas: { title: 'Service areas', body: 'Contact us to check whether your school or area is covered.' },
  school_steps: {
    items: [
      { title: 'Contact us', text: "Tell us your child's school and pickup area." },
      { title: 'Confirm the route', text: 'We check the route and seat availability.' },
      { title: 'Start riding', text: 'Pay a simple monthly fee per student.' },
    ],
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const items = (v: unknown, d: Item[]): Item[] => {
  if (!Array.isArray(v)) return d;
  const out = v.filter(isObj).map(x => ({ title: str(x.title, '').trim(), text: str(x.text, '').trim() })).filter(x => x.title || x.text);
  return out.length ? out : d;
};
const lines = (v: unknown, d: string[]): string[] => {
  if (!Array.isArray(v)) return d;
  const out = v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean);
  return out.length ? out : d;
};

/** Merge database rows over the defaults. Missing or malformed values quietly fall back, so a half-edited row can never blank a page. */
export function mergeContent(rows: Record<string, WebsiteContent>): SiteContent {
  const D = DEFAULT_CONTENT;
  const r = (k: ContentKey) => rows[k];
  const d = (k: ContentKey) => (isObj(r(k)?.data) ? (r(k)!.data as Record<string, unknown>) : {});
  return {
    home_hero: {
      badge: str(d('home_hero').badge, D.home_hero.badge), title: str(r('home_hero')?.title, D.home_hero.title), highlight: str(d('home_hero').highlight, D.home_hero.highlight),
      body: str(r('home_hero')?.body, D.home_hero.body), cta_primary: str(d('home_hero').cta_primary, D.home_hero.cta_primary), cta_secondary: str(d('home_hero').cta_secondary, D.home_hero.cta_secondary),
    },
    home_services: { title: str(r('home_services')?.title, D.home_services.title), body: str(r('home_services')?.body, D.home_services.body) },
    home_fleet: { title: str(r('home_fleet')?.title, D.home_fleet.title), body: str(r('home_fleet')?.body, D.home_fleet.body) },
    why_choose_us: { title: str(r('why_choose_us')?.title, D.why_choose_us.title), body: str(r('why_choose_us')?.body, D.why_choose_us.body), items: items(d('why_choose_us').items, D.why_choose_us.items) },
    about_standards: { title: str(r('about_standards')?.title, D.about_standards.title), items: lines(d('about_standards').items, D.about_standards.items) },
    school_transport_intro: { title: str(r('school_transport_intro')?.title, D.school_transport_intro.title), body: str(r('school_transport_intro')?.body, D.school_transport_intro.body) },
    school_service_areas: { title: str(r('school_service_areas')?.title, D.school_service_areas.title), body: str(r('school_service_areas')?.body, D.school_service_areas.body) },
    school_steps: { items: items(d('school_steps').items, D.school_steps.items) },
  };
}

/** Row to store for a key (the inverse of mergeContent). */
export function toRow<K extends ContentKey>(key: K, v: SiteContent[K]): Pick<WebsiteContent, 'key' | 'title' | 'body' | 'data' | 'is_published'> {
  const o = v as Record<string, unknown>;
  const { title, body, ...rest } = o;
  return { key, title: typeof title === 'string' ? title : null, body: typeof body === 'string' ? body : null, data: rest, is_published: true };
}
