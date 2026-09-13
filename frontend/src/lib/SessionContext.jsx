import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { reconcileTripOwner, tripOwner } from "./tripStorage";
import { clearSavedCount } from "./savedCount";
import { clearBookmarksCache } from "./bookmarksCache";
import { clearReviewsCache } from "./reviewsCache";

// Single source of truth for the Supabase session, read once at the app
// root. Every page used to call supabase.auth.getSession() independently on
// mount, which raced the async Google OAuth code-exchange after the
// redirect back from Google: a page could mount and read "no session"
// moments before the exchange finished, rendering it as a guest.
const SessionContext = createContext({ session: null, loading: true });

let lastOwner = null;

function syncIdentity(nextSession) {
  reconcileTripOwner(nextSession);
  const nextOwner = tripOwner(nextSession);
  if (nextOwner === lastOwner) return;
  lastOwner = nextOwner;
  clearSavedCount();
  clearBookmarksCache();
  clearReviewsCache();
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      syncIdentity(data.session);
      setSession(data.session);
      setLoading(false);
    }).catch((error) => {
      console.error("getSession() failed:", error);
      syncIdentity(null);
      setSession(null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      syncIdentity(nextSession);
      setSession(nextSession);
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
