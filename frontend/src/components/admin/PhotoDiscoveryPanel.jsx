import { useState } from "react";
import { Sparkles, ImagePlus, X, Loader2 } from "lucide-react";
import { discoverVendorPhotos, commitVendorPhoto } from "../../api/admin";

// "Find Photos Automatically" — admin-triggered only (never on page load, never
// per-vendor-per-render): calls POST /photos/discover once per click, shows
// each returned candidate (already filtered server-side to >=60% confidence —
// nothing below that ever reaches this component) with its match reasoning,
// and lets the admin commit exactly one at a time to Cover or Gallery. A
// manually-set cover is hard-locked server-side; this panel just reflects
// that by disabling "Set as Cover" rather than letting a click fail silently.
export default function PhotoDiscoveryPanel({ vendorId, latitude, longitude, coverLocked, onPhotoCommitted, notify }) {
  const [candidates, setCandidates] = useState(null); // null = not searched yet
  const [searching, setSearching] = useState(false);
  const [committingRef, setCommittingRef] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [searchError, setSearchError] = useState("");

  // Mapillary/Flickr need coordinates and the video-frame/TikTok-oEmbed
  // providers need the vendor's source video, but Wikimedia only needs the
  // vendor's name (every vendor has one) — so a search is always worth
  // trying now; it may just come back empty if no provider has a match.
  const latNum = Number(latitude);
  const lngNum = Number(longitude);
  const coordsProvided = latitude !== "" && latitude != null && longitude !== "" && longitude != null;
  const coordsAreNumbers = Number.isFinite(latNum) && Number.isFinite(lngNum);
  const coordsInRange = coordsAreNumbers && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180;

  const runSearch = async () => {
    setSearching(true);
    setSearchError("");
    setDismissed(new Set());
    try {
      const { candidates: found } = await discoverVendorPhotos(vendorId);
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
      const result = await commitVendorPhoto(vendorId, {
        provider: candidate.provider,
        photoRef: candidate.photoRef,
        role,
        confidence: candidate.confidence,
        matchMeta: candidate.breakdown,
      });
      notify?.(`Photo added as ${role === "cover" ? "the cover photo" : "a gallery photo"}.`);
      onPhotoCommitted?.(role, result.url);
      setDismissed((cur) => new Set(cur).add(candidate.photoRef));
    } catch (err) {
      notify?.(err.message || "Could not save that photo.", true);
    } finally {
      setCommittingRef(null);
    }
  };

  const visibleCandidates = (candidates || []).filter((c) => !dismissed.has(c.photoRef));

  return (
    <div className="admin-photo-discovery">
      <div className="admin-photo-discovery-header">
        <span>Find Photos Automatically</span>
        <button
          type="button"
          className="admin-secondary-btn compact"
          onClick={runSearch}
          disabled={searching}
        >
          {searching ? <Loader2 size={14} className="admin-spin" /> : <Sparkles size={14} />}
          <span>{searching ? "Searching…" : candidates ? "Search Again" : "Find Photos Automatically"}</span>
        </button>
      </div>

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
                    disabled={busy}
                  >
                    <ImagePlus size={12} /> Add to Gallery
                  </button>
                  <button
                    type="button"
                    className="admin-icon-btn subtle"
                    onClick={() => setDismissed((cur) => new Set(cur).add(candidate.photoRef))}
                    aria-label="Ignore this candidate"
                    disabled={busy}
                  >
                    <X size={14} />
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
