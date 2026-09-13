import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { clearTrip, createTripSessionBoundary } from "./tripStorage";
import { clearMapOrigin, createMapOriginSessionBoundary } from "./mapOriginSession";
import { clearSavedCount } from "./savedCount";
import { clearBookmarksCache } from "./bookmarksCache";
import { clearReviewsCache } from "./reviewsCache";

// Single source of truth for the Supabase session, read once at the app
// root. Every page used to call supabase.auth.getSession() independently on
// mount, which raced the async Google OAuth code-exchange after the
// redirect back from Google: a page could mount and read "no session"
// moments before the exchange finished, rendering it as a guest.
const SessionContext = createContext({ session: null, loading: true });

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const tripSessionBoundary = useRef(null);
  const mapOriginSessionBoundary = useRef(null);
  if (!tripSessionBoundary.current) {
    tripSessionBoundary.current = createTripSessionBoundary(() => {
      clearTrip();
      clearSavedCount();
      clearBookmarksCache();
      clearReviewsCache();
    });
  }
  if (!mapOriginSessionBoundary.current) {
    mapOriginSessionBoundary.current = createMapOriginSessionBoundary(clearMapOrigin);
  }
  const observeTripSession = tripSessionBoundary.current;
  const observeMapOriginSession = mapOriginSessionBoundary.current;

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => {
        observeTripSession(data.session);
        observeMapOriginSession(data.session);
        setSession(data.session);
        setLoading(false);
      })
      .catch((err) => {
        console.error("getSession() failed:", err);
        observeTripSession(null);
        observeMapOriginSession(null);
        setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      observeTripSession(s);
      observeMapOriginSession(s);
      setSession(s);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, [observeTripSession, observeMapOriginSession]);

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
