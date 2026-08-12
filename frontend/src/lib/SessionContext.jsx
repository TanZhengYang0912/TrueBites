import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// Single source of truth for the Supabase session, read once at the app
// root. Every page used to call supabase.auth.getSession() independently on
// mount, which raced the async Google OAuth code-exchange after the
// redirect back from Google: a page could mount and read "no session"
// moments before the exchange finished, rendering it as a guest.
const SessionContext = createContext({ session: null, loading: true });

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch((err) => {
        console.error("getSession() failed:", err);
        setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
