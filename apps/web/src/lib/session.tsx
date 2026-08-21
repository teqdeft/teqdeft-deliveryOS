import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { get, getToken, post, setToken, type Session } from './api.js';
import type { Capability } from './types.js';

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (capability: Capability) => boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Restore the session on load so a refresh does not sign the user out.
    // With no stored token there is nothing to restore, and asking anyway
    // guarantees a 401 on every cold load.
    if (!getToken()) {
      setLoading(false);
      return;
    }
    get<Session>('/auth/me')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await post<Session & { token: string }>('/auth/login', { email, password });
      setToken(result.token);
      setSession({ user: result.user, capabilities: result.capabilities });
      // Whatever is cached belongs to whoever was signed in before.
      queryClient.clear();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    setToken(null);
    setSession(null);
    // Without this the next person to sign in on this browser sees the
    // previous user's cached projects — including commercial values their own
    // role would have had redacted.
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      loading,
      signIn,
      signOut,
      // Capabilities come from the server; the UI only uses them to hide
      // controls. Every one of them is enforced again server-side.
      can: (capability) => session?.capabilities.includes(capability) ?? false,
    }),
    [session, loading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside a SessionProvider');
  return context;
}
