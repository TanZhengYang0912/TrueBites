import { useState } from "react";
import { Sparkles, ImagePlus, X, Loader2 } from "lucide-react";
import { discoverVendorPhotos, discoverVendorPhotosPreview, commitVendorPhoto } from "../../api/admin";

// "Find Photos Automatically" — admin-triggered only (never on page load, never
// per-vendor-per-render): calls POST /photos/discover once per click, shows
// each returned candidate (already filtered server-side to >=60% confidence —
// nothing below that ever reaches this component) with its match reasoning,
// and lets the admin commit exactly one at a time to Cover or Gallery. A
// manually-set cover is hard-locked server-side; this panel just reflects
// that by disabling "Set as Cover" rather than letting a click fail silently.
//
// `vendorId` is nullable — the Add Vendor form's first step renders this
// panel before the vendor row exists. In that mode (`vendorId == null`),
// search hits the id-less /photos/discover-preview endpoint (via
// `vendorFields`) instead, and "committing" a candidate calls `onStage`
// (synchronous, no network) instead of the real commit endpoint — the actual
// server-side commit happens once, right after the vendor is created, using
// whatever got staged. Every other usage (Edit Vendor, Add Vendor step 2)
// always passes a real vendorId and is unaffected by this branch.
export default function PhotoDiscoveryPanel({ vendorId, vendorFields, latitude, longitude, coverLocked, galleryFull, excludeKeys, onPhotoCommitted, onStage, notify }) {
  const [candidates, setCandidates] = useState(null); // null = not searched yet
  const [searching, setSearching] = useState(false);
  const [committingRef, setCommittingRef] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [searchError, setSearchError] = useState("");
  // Candidates actually committed (real mode) or staged (vendorId==null
  // mode) THIS session — unlike `dismissed` (a plain "X" ignore, reset on
  // every new search since the admin might reconsider), this is never reset,
  // so a used photo can't resurface on "Search Again" even if the server's
  // own vendor_photos-backed dedup fails (e.g. that table's one-time setup
  // was never run — see recordVendorPhoto's comment in routes/vendors.js).
  // That server-side path is still the one that survives closing and
  // reopening Edit Vendor; this is purely a same-session backstop.
  const [usedKeysThisSession, setUsedKeysThisSession] = useState(() => new Set());

  // Mapillary/Overpass need coordinates and the video-frame/TikTok-oEmbed
  // providers need the vendor's source video, but Wikimedia only needs the
  // vendor's name (every vendor has one) — so a search is always worth
  // trying now; it may just come back empty if no provider has a match.
  const latNum = Number(latitude);
  const lngNum = Number(longitude);
  const coordsProvided = latitude !== "" && latitude != null && longitude !== "" && longitude != null;
  const coordsAreNumbers = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const coordsInRange = coordsAreNumbers && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;
  // Every provider needs a name; in preview mode (no vendorId yet) that only
  // comes from the in-progress form, so it can genuinely still be empty.
  const nameMissing = !vendorId && !vendorFields?.vendor_name?.trim();

  const runSearch = async () => {
    setSearching(true);
    setSearchError("");
    setDismissed(new Set());
    try {
      // Send the coordinates currently in the form — including an unsaved
      // marker drag or manual edit — so the search reflects where the pin
      // is right now, not just what's already persisted for this vendor.
      const { candidates: found } = vendorId
        ? await discoverVendorPhotos(vendorId, coordsInRange ? { latitude: latNum, longitude: lngNum } : null)
        : await discoverVendorPhotosPreview({
            vendor_name: vendorFields?.vendor_name,
            address: vendorFields?.address,
            cuisine_types: vendorFields?.cuisine_types,
            latitude: coordsInRange ? latNum : null,
            longitude: coordsInRange ? lngNum : null,
          });
      setCandidates(found);
    } catch (err) {
      setSearchError(err.message || "Search failed — please try again.");
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  };

  const commit = async (candidate, role) => {
    setCommittingRef(candidate.photoRef + role);
    try {
      if (vendorId) {
        const result = await commitVendorPhoto(vendorId, {
          provider: candidate.provider,
          photoRef: candidate.photoRef,
          role,
          confidence: candidate.confidence,
          matchMeta: candidate.breakdown,
          dedupeKey: candidate.dedupeKey,
        });
        // The photo itself is saved either way — historyRecorded:false just
        // means the server couldn't record this pick's dedupe entry (see the
        // matching comment on recordVendorPhoto in routes/vendors.js), so it
        // can quietly resurface on a later "Search Again" instead of staying
        // excluded. Worth telling the admin now rather than leaving them to
        // wonder why an already-used photo came back.
        if (result.historyRecorded === false) {
          notify?.(
            `Photo added as ${role === "cover" ? "the cover photo" : "a gallery photo"}, but its search history couldn't be recorded — it may show up again on a later search.`,
            true
          );
        } else {
          notify?.(`Photo added as ${role === "cover" ? "the cover photo" : "a gallery photo"}.`);
        }
        onPhotoCommitted?.(role, result.url);
      } else {
        // No vendor row yet — stage locally. The candidate's own previewUrl
        // stands in for the real (not-yet-uploaded) storage URL so callers
        // get the same onPhotoCommitted(role, url) shape either way; the
        // parent commits this candidate for real right after the vendor is
        // created.
        onStage?.(candidate, role);
        notify?.(`Photo selected as ${role === "cover" ? "the cover photo" : "a gallery photo"} — it'll be saved once you create this vendor.`);
        onPhotoCommitted?.(role, candidate.previewUrl);
      }
      setDismissed((cur) => new Set(cur).add(candidate.photoRef));
      setUsedKeysThisSession((cur) => new Set(cur).add(`${candidate.provider}::${candidate.dedupeKey}`));
    } catch (err) {
      notify?.(err.message || "Could not save that photo.", true);
    } finally {
      setCommittingRef(null);
    }
  };

  // In real (vendorId) mode, an already-committed photo is SUPPOSED to never
  // come back from the server at all — /photos/discover excludes it via
  // vendor_photos — but that only works when that table's one-time setup was
  // actually run (see recordVendorPhoto's comment in routes/vendors.js);
  // usedKeysThisSession is the guaranteed same-session backstop regardless.
  // `excludeKeys`, when supplied, is the caller's own record of what's
  // already been staged in vendorId==null mode (the Add Vendor form's step
  // 1, which has no vendor_photos row to check at all yet) — functionally
  // the same idea, just tracked one level up since staged picks live in the
  // parent's state, not this component's.
  const visibleCandidates = (candidates || []).filter(
    (c) =>
      !dismissed.has(c.photoRef) &&
      !usedKeysThisSession.has(`${c.provider}::${c.dedupeKey}`) &&
      !excludeKeys?.has(`${c.provider}::${c.dedupeKey}`)
  );

  return (
    <div className="admin-photo-discovery">
      <div className="admin-photo-discovery-header">
        <span>Find Photos Automatically</span>
        <button
          type="button"
          className="admin-secondary-btn compact"
          onClick={runSearch}
          disabled={searching || nameMissing}
          title={nameMissing ? "Enter a vendor name first" : undefined}
        >
          {searching ? <Loader2 size={14} className="admin-spin" /> : <Sparkles size={14} />}
          <span>{searching ? "Searching…" : candidates ? "Search Again" : "Find Photos Automatically"}</span>
        </button>
      </div>

      {visibleCandidates.length === 0 && (
        <p className="admin-field-hint">
          Searches this vendor's own source video first (if it has one), then falls back to
          Google Places photos near its coordinates and a Wikimedia Commons name search.
          Never another vendor's photos.
        </p>
      )}

      {nameMissing && (
        <p className="admin-field-hint">Enter a vendor name above before searching for photos.</p>
      )}

      {coordsProvided && !coordsInRange && (
        <p className="admin-field-hint">Please enter a valid latitude and longitude.</p>
      )}

      {searching && (
        <div className="admin-photo-discovery-grid">
          {[0, 1, 2].map((i) => <div key={i} className="admin-photo-skeleton" />)}
        </div>
      )}

      {!searching && searchError && (
        <div className="admin-feedback error">{searchError}</div>
      )}

      {!searching && candidates && !searchError && visibleCandidates.length === 0 && (
        <p className="admin-field-hint">No verified vendor photos were found. Use the upload fields below instead.</p>
      )}

      {!searching && visibleCandidates.length > 0 && (
        <div className="admin-photo-discovery-grid">
          {visibleCandidates.map((candidate) => {
            const confidenceClass = candidate.confidence >= 85 ? "high" : "medium";
            const busy = committingRef?.startsWith(candidate.photoRef);
            return (
              <div className="admin-photo-candidate" key={candidate.photoRef}>
                <div className="admin-photo-candidate-preview">
                  <img src={candidate.previewUrl} alt={candidate.placeName || "Candidate photo"} loading="lazy" />
                  <span className={`admin-confidence-badge ${confidenceClass}`}>{candidate.confidence}%</span>
                  <button
                    type="button"
                    className="admin-photo-candidate-dismiss"
                    onClick={() => setDismissed((cur) => new Set(cur).add(candidate.photoRef))}
                    aria-label="Ignore this candidate"
                    disabled={busy}
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="admin-photo-candidate-meta">
                  <strong>{candidate.breakdown.matchedPlaceName || candidate.placeName}</strong>
                  {candidate.breakdown.distanceMeters != null && <span>{candidate.breakdown.distanceMeters}m away</span>}
                  <span>{candidate.breakdown.note}</span>
                </div>
                <div className="admin-photo-candidate-actions">
                  <button
                    type="button"
                    className="admin-secondary-btn compact"
                    onClick={() => commit(candidate, "cover")}
                    disabled={coverLocked || busy}
                    title={coverLocked ? "This vendor already has a manually-uploaded cover photo" : undefined}
                  >
                    Set as Cover
                  </button>
                  <button
                    type="button"
                    className="admin-secondary-btn compact"
                    onClick={() => commit(candidate, "gallery")}
                    disabled={busy || galleryFull}
                    title={galleryFull ? "Gallery is full — remove a selected photo first" : undefined}
                  >
                    <ImagePlus size={12} /> Add to Gallery
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
