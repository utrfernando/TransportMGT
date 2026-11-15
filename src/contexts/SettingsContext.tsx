import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured, type PublicSettings } from '../lib/supabase';

const DEFAULTS: PublicSettings = {
  business_name: 'Transport Business',
  tagline: 'Safe, reliable transport you can trust',
  logo_url: null, address: null, phone: null, whatsapp: null, email: null, maps_url: null,
  social: {}, about_text: null, mission: null, vision: null, currency: 'LKR',
};

interface SettingsContextType {
  settings: PublicSettings;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PublicSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    const { data } = await supabase.rpc('get_public_settings');
    if (data) setSettings({ ...DEFAULTS, ...(data as Partial<PublicSettings>), social: (data as PublicSettings).social ?? {} });
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => { document.title = `${settings.business_name} — ${settings.tagline}`; }, [settings.business_name, settings.tagline]);

  return <SettingsContext.Provider value={{ settings, loading, refresh }}>{children}</SettingsContext.Provider>;
};
