import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { supabase, type WebsiteContent } from '../../lib/supabase';
import { check, unwrap } from '../../lib/db';
import { DEFAULT_CONTENT, mergeContent, toRow, type ContentKey, type Item, type SiteContent } from '../../lib/siteContent';
import { useQuery } from '../../lib/queries';
import { useToast } from '../../contexts/ToastContext';
import { AdminHeader, Card } from '../../components/admin/ui';
import { Tabs } from '../../components/admin/crud';
import WebsiteListings from '../../components/admin/WebsiteListings';
import WebsiteServices from '../../components/admin/WebsiteServices';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Field, Input, Textarea } from '../../components/ui/Input';

const TABS = [{ key: 'home', label: 'Home page' }, { key: 'about', label: 'About & school transport' }, { key: 'services', label: 'Services' }, { key: 'vehicles', label: 'Vehicles' }];
const HOME_KEYS: ContentKey[] = ['home_hero', 'home_services', 'home_fleet', 'hire_steps', 'why_choose_us'];
const ABOUT_KEYS: ContentKey[] = ['about_standards', 'school_transport_intro', 'school_service_areas', 'school_steps'];

/** Editor for a list of {title, text} cards. */
const ItemsEditor: React.FC<{ items: Item[]; onChange: (v: Item[]) => void; max: number; noun: string }> = ({ items, onChange, max, noun }) => (
  <div className="space-y-3">
    {items.map((it, i) => (
      <div key={i} className="grid sm:grid-cols-[1fr_2fr_auto] gap-3 items-start rounded-2xl bg-ink-50 p-3">
        <Input aria-label={`${noun} ${i + 1} title`} placeholder="Title" maxLength={60} value={it.title} onChange={e => onChange(items.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
        <Input aria-label={`${noun} ${i + 1} text`} placeholder="Short text" maxLength={160} value={it.text} onChange={e => onChange(items.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
        <button type="button" aria-label={`Remove ${noun} ${i + 1}`} disabled={items.length <= 1} onClick={() => onChange(items.filter((_, k) => k !== i))} className="p-2.5 rounded-full hover:bg-ink-100 text-red-500 disabled:opacity-30"><Trash2 size={16} /></button>
      </div>))}
    <Button type="button" size="sm" variant="outline" disabled={items.length >= max} onClick={() => onChange([...items, { title: '', text: '' }])}><Plus size={14} /> Add {noun}</Button>
  </div>
);

const AdminWebsite: React.FC = () => {
  const toast = useToast();
  const [tab, setTab] = useState('home');
  const [draft, setDraft] = useState<SiteContent>(DEFAULT_CONTENT);
  const [saving, setSaving] = useState(false);
  const [resetKeys, setResetKeys] = useState<ContentKey[] | null>(null);

  const rows = useQuery(async () => Object.fromEntries((unwrap(await supabase.from('website_content').select('*')) as WebsiteContent[]).map(r => [r.key, r])) as Record<string, WebsiteContent>, {} as Record<string, WebsiteContent>);
  useEffect(() => { if (!rows.loading && !rows.error) setDraft(mergeContent(rows.data)); }, [rows.data, rows.loading, rows.error]);

  const set = <K extends ContentKey>(k: K, patch: Partial<SiteContent[K]>) => setDraft(d => ({ ...d, [k]: { ...d[k], ...patch } }));

  const save = async (keys: ContentKey[]) => {
    setSaving(true);
    try {
      // blank cards are dropped; an emptied heading falls back to its default instead of leaving a gap
      const clean: SiteContent = { ...draft,
        why_choose_us: { ...draft.why_choose_us, items: draft.why_choose_us.items.filter(i => i.title.trim() || i.text.trim()) },
        school_steps: { items: draft.school_steps.items.filter(i => i.title.trim() || i.text.trim()) },
        hire_steps: { ...draft.hire_steps, items: draft.hire_steps.items.filter(i => i.title.trim() || i.text.trim()) },
        about_standards: { ...draft.about_standards, items: draft.about_standards.items.map(s => s.trim()).filter(Boolean) } };
      check(await supabase.from('website_content').upsert(keys.map(k => toRow(k, clean[k] as never)), { onConflict: 'key' }));
      toast.success('Saved — the website is updated'); rows.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save'); } finally { setSaving(false); }
  };

  const reset = async () => {
    if (!resetKeys) return;
    try {
      check(await supabase.from('website_content').delete().in('key', resetKeys));
      toast.success('Restored the original wording'); setResetKeys(null); rows.reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not reset'); }
  };

  const h = draft.home_hero, w = draft.why_choose_us;
  const actions = (keys: ContentKey[]) => (
    <div className="flex flex-wrap justify-between gap-3 pt-2">
      <Button variant="ghost" onClick={() => setResetKeys(keys)}><RotateCcw size={16} /> Restore original wording</Button>
      <Button onClick={() => save(keys)} loading={saving}>Save changes</Button>
    </div>
  );

  return (
    <div>
      <AdminHeader title="Website" subtitle="Everything visitors read on the public site is controlled from here and Business Settings"
        actions={<a href="/" target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink size={16} /> View website</Button></a>} />
      <p className="mb-4 text-sm text-ink-500">Business name, logo, phone, WhatsApp, email, address, map link, social links, “About us”, mission and vision are in <Link className="font-bold text-mint-700 underline" to="/admin/settings">Business Settings</Link>.</p>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {rows.loading ? <Skeleton className="h-64" /> : rows.error ? <ErrorState message={rows.error} onRetry={rows.reload} /> : <>
        {tab === 'home' && (
          <div className="space-y-5">
            <Card title="Top banner">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Small label above the heading"><Input maxLength={60} value={h.badge} onChange={e => set('home_hero', { badge: e.target.value })} /></Field>
                <div />
                <Field label="Heading (first part)"><Input maxLength={60} value={h.title} onChange={e => set('home_hero', { title: e.target.value })} /></Field>
                <Field label="Heading (highlighted part)"><Input maxLength={40} value={h.highlight} onChange={e => set('home_hero', { highlight: e.target.value })} /></Field>
                <Field label="Paragraph under the heading" className="sm:col-span-2" hint="Leave empty to use your tagline from Business Settings plus a standard sentence."><Textarea rows={2} maxLength={300} value={h.body} onChange={e => set('home_hero', { body: e.target.value })} /></Field>
                <Field label="Main button text"><Input maxLength={30} value={h.cta_primary} onChange={e => set('home_hero', { cta_primary: e.target.value })} /></Field>
                <Field label="WhatsApp button text" hint="Shown only when a WhatsApp number is set."><Input maxLength={30} value={h.cta_secondary} onChange={e => set('home_hero', { cta_secondary: e.target.value })} /></Field>
              </div>
            </Card>
            <Card title="Section headings">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Services heading"><Input maxLength={60} value={draft.home_services.title} onChange={e => set('home_services', { title: e.target.value })} /></Field>
                <Field label="Services sub-text"><Input maxLength={200} value={draft.home_services.body} onChange={e => set('home_services', { body: e.target.value })} /></Field>
                <Field label="Vehicles heading"><Input maxLength={60} value={draft.home_fleet.title} onChange={e => set('home_fleet', { title: e.target.value })} /></Field>
                <Field label="Vehicles sub-text"><Input maxLength={200} value={draft.home_fleet.body} onChange={e => set('home_fleet', { body: e.target.value })} /></Field>
              </div>
            </Card>
            <Card title="“How hiring works”">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <Field label="Heading"><Input maxLength={60} value={draft.hire_steps.title} onChange={e => set('hire_steps', { title: e.target.value })} /></Field>
                <Field label="Sub-text"><Input maxLength={200} value={draft.hire_steps.body} onChange={e => set('hire_steps', { body: e.target.value })} /></Field>
              </div>
              <ItemsEditor items={draft.hire_steps.items} onChange={items => set('hire_steps', { items })} max={5} noun="hiring step" />
            </Card>
            <Card title="“Why choose us”">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <Field label="Heading"><Input maxLength={60} value={w.title} onChange={e => set('why_choose_us', { title: e.target.value })} /></Field>
                <Field label="Sub-text"><Input maxLength={200} value={w.body} onChange={e => set('why_choose_us', { body: e.target.value })} /></Field>
              </div>
              <ItemsEditor items={w.items} onChange={items => set('why_choose_us', { items })} max={8} noun="reason" />
            </Card>
            {actions(HOME_KEYS)}
          </div>)}

        {tab === 'about' && (
          <div className="space-y-5">
            <Card title="About page — service standards">
              <Field label="Heading"><Input maxLength={60} value={draft.about_standards.title} onChange={e => set('about_standards', { title: e.target.value })} /></Field>
              <Field label="Standards (one per line)" className="mt-4"><Textarea rows={6} value={draft.about_standards.items.join('\n')} onChange={e => set('about_standards', { items: e.target.value.split('\n') })} /></Field>
            </Card>
            <Card title="School transport page">
              <div className="grid gap-4">
                <Field label="Page sub-heading"><Input maxLength={100} value={draft.school_transport_intro.title} onChange={e => set('school_transport_intro', { title: e.target.value })} /></Field>
                <Field label="Introduction"><Textarea rows={4} maxLength={800} value={draft.school_transport_intro.body} onChange={e => set('school_transport_intro', { body: e.target.value })} /></Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Service areas heading"><Input maxLength={60} value={draft.school_service_areas.title} onChange={e => set('school_service_areas', { title: e.target.value })} /></Field>
                  <Field label="Service areas text" hint="List the areas and schools you cover. Never include student details."><Textarea rows={3} maxLength={800} value={draft.school_service_areas.body} onChange={e => set('school_service_areas', { body: e.target.value })} /></Field>
                </div>
                <div><p className="mb-2 text-sm font-bold text-ink-700">How to register (steps)</p>
                  <ItemsEditor items={draft.school_steps.items} onChange={items => setDraft(d => ({ ...d, school_steps: { items } }))} max={5} noun="step" /></div>
              </div>
            </Card>
            {actions(ABOUT_KEYS)}
          </div>)}

        {tab === 'services' && <WebsiteServices />}
        {tab === 'vehicles' && <WebsiteListings />}
      </>}

      <ConfirmDialog open={!!resetKeys} title="Restore original wording?" confirmLabel="Restore" message="The text on this tab goes back to the original wording on the website. Your services, vehicles and Business Settings are not affected." onClose={() => setResetKeys(null)} onConfirm={reset} />
    </div>
  );
};

export default AdminWebsite;
