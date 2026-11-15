import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT, mergeContent, toRow } from './siteContent';
import type { WebsiteContent } from './supabase';

const row = (r: Partial<WebsiteContent> & { key: string }): WebsiteContent => ({ title: null, body: null, data: {}, is_published: true, ...r });

describe('website content', () => {
  it('uses the built-in wording when nothing has been saved', () => {
    expect(mergeContent({})).toEqual(DEFAULT_CONTENT);
  });
  it('lets saved text override the defaults, section by section', () => {
    const c = mergeContent({ home_hero: row({ key: 'home_hero', title: 'Ride with us', data: { highlight: 'today', cta_primary: 'Book now' } }) });
    expect(c.home_hero.title).toBe('Ride with us');
    expect(c.home_hero.highlight).toBe('today');
    expect(c.home_hero.cta_primary).toBe('Book now');
    expect(c.home_hero.badge).toBe(DEFAULT_CONTENT.home_hero.badge);   // untouched fields keep their default
    expect(c.home_fleet).toEqual(DEFAULT_CONTENT.home_fleet);
  });
  it('never lets a malformed or emptied list blank a page', () => {
    const c = mergeContent({
      why_choose_us: row({ key: 'why_choose_us', title: 'Why us', data: { items: 'not a list' } }),
      about_standards: row({ key: 'about_standards', data: { items: ['  ', ''] } }),
      school_steps: row({ key: 'school_steps', data: { items: [{ title: '', text: '' }] } }),
    });
    expect(c.why_choose_us.items).toEqual(DEFAULT_CONTENT.why_choose_us.items);
    expect(c.about_standards.items).toEqual(DEFAULT_CONTENT.about_standards.items);
    expect(c.school_steps.items).toEqual(DEFAULT_CONTENT.school_steps.items);
  });
  it('round-trips through the database row format', () => {
    const edited = { ...DEFAULT_CONTENT.why_choose_us, title: 'Our promise', items: [{ title: 'Clean', text: 'Spotless buses' }] };
    const saved = toRow('why_choose_us', edited);
    expect(saved).toMatchObject({ key: 'why_choose_us', title: 'Our promise', is_published: true });
    expect(mergeContent({ why_choose_us: row(saved) }).why_choose_us).toEqual(edited);
    const hero = { ...DEFAULT_CONTENT.home_hero, body: 'Custom paragraph' };
    expect(mergeContent({ home_hero: row(toRow('home_hero', hero)) }).home_hero).toEqual(hero);
    expect(mergeContent({ school_steps: row(toRow('school_steps', DEFAULT_CONTENT.school_steps)) }).school_steps).toEqual(DEFAULT_CONTENT.school_steps);
  });
});
