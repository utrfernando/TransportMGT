import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, type Profile } from '../lib/supabase';

interface AuthContextType {
  profile: Profile | null;
  authUserId: string | null;
  loading: boolean;
  isAdmin: boolean;   // any active administrator (OWNER or ADMIN)
  isOwner: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    // RLS lets a user read their own row only (admins read all).
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);
      if (uid) await fetchProfile(uid);
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);
      if (!uid) { setProfile(null); return; }
      // defer: calling supabase inside this callback can deadlock
      setTimeout(() => { fetchProfile(uid); }, 0);
    });

    return () => { mounted = false; subscription.unsubscribe(); };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: p } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (!p || !(p as Profile).is_active) {
      await supabase.auth.signOut();
      throw new Error('This account is not authorised to access the admin area.');
    }
    setProfile(p as Profile);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setAuthUserId(null);
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const isAdmin = !!profile && profile.is_active;
  const isOwner = isAdmin && profile!.role === 'OWNER';

  return (
    <AuthContext.Provider value={{ profile, authUserId, loading, isAdmin, isOwner, signIn, signOut, sendPasswordReset, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};
