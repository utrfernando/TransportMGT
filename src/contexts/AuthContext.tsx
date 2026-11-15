import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured, type Profile } from '../lib/supabase';

interface AuthContextType {
  profile: Profile | null;
  authUserId: string | null;
  loading: boolean;
  isAdmin: boolean;   // any active administrator (OWNER or ADMIN)
  isOwner: boolean;
  /** signed in but not staff: a parent / hire customer using the portal */
  isCustomer: boolean;
  /** what a non-staff login is: a driver, a family/customer, or both (null until known) */
  kind: { driver: boolean; family: boolean } | null;
  userEmail: string | null;
  userName: string | null;
  /** the business set a temporary password: the customer must choose their own before using the portal */
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** customer / parent sign-in (no staff profile needed) */
  signInCustomer: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<{ needsConfirmation: boolean }>;
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
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [mustChangePassword, setMustChange] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [kind, setKind] = useState<{ driver: boolean; family: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    // RLS lets a user read their own row only (admins read all).
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile | null) ?? null);
    if (data) { setKind(null); return; }
    const { data: k } = await supabase.rpc('portal_whoami');
    setKind((k as { driver: boolean; family: boolean } | null) ?? { driver: false, family: true });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);
      setUserEmail(session?.user?.email ?? null);
      setUserName((session?.user?.user_metadata?.full_name as string | undefined) ?? null);
      setMustChange(session?.user?.user_metadata?.must_change_password === true);
      if (uid) await fetchProfile(uid);
      if (mounted) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);
      setUserEmail(session?.user?.email ?? null);
      setUserName((session?.user?.user_metadata?.full_name as string | undefined) ?? null);
      setMustChange(session?.user?.user_metadata?.must_change_password === true);
      if (!uid) { setProfile(null); setKind(null); return; }
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

  const signInCustomer = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string, phone: string) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, phone }, emailRedirectTo: `${window.location.origin}/account` },
    });
    if (error) throw error;
    // with email confirmation on (required for this system) there is no session until the link in the email is opened
    return { needsConfirmation: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setKind(null);
    setAuthUserId(null);
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    // choosing a password also clears the "temporary password" flag the business may have set
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
    if (!error) setMustChange(false);
    if (error) throw error;
  };

  const isAdmin = !!profile && profile.is_active;
  const isOwner = isAdmin && profile!.role === 'OWNER';
  const isCustomer = !!authUserId && !isAdmin;

  return (
    <AuthContext.Provider value={{ profile, authUserId, loading, isAdmin, isOwner, isCustomer, kind, userEmail, userName, mustChangePassword, signIn, signInCustomer, signUp, signOut, sendPasswordReset, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
};
