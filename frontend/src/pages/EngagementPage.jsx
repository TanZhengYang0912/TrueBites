import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Heart, Trash2, FolderInput, Plus } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import {
  getBookmarks, getFolders, addBookmark, removeBookmark, moveBookmark, createFolder, deleteFolder,
  getMyReviews,
} from "../api/engagement";
import Toast from "../components/engagement/Toast";
import DiscoveryHeader from "../components/discovery/DiscoveryHeader";
import { useToast, sleep } from "../lib/useToast";
import VendorCard from "../components/discovery/VendorCard";
import { customerSession } from "../lib/roles";
import VendorDetailModal from "../components/discovery/VendorDetailModal";
import FolderPickerModal from "../components/engagement/FolderPickerModal";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";

const TERRACOTTA = "#A35D47";
const MUTED = "#69717A";

export default function EngagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);
  const [tab, setTab] = useState(searchParams.get("tab") === "reviews" ? "reviews" : "bookmarks");

  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [detailVendor, setDetailVendor] = useState(null);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null); // vendor awaiting a folder pick
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState(null); // folder awaiting delete confirmation
  const [toast, notify] = useToast();
  const bookmarkedVendorIds = new Set(bookmarks.map((b) => b.vendor_id));

  useEffect(() => {
    if (!session && !ENGAGEMENT_TEST_MODE) return;
    refreshBookmarks();
    refreshReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function refreshBookmarks() {
    getFolders().then((f) => setFolders(f.folders)).catch((e) => { console.error(e.message); notify("Couldn't load your folders.", true); });
    getBookmarks().then((b) => setBookmarks(b.bookmarks)).catch((e) => { console.error(e.message); notify("Couldn't load your bookmarks.", true); });
  }
  function refreshReviews() {
    getMyReviews().then((r) => setReviews(r.reviews)).catch((e) => { console.error(e.message); notify("Couldn't load your reviews.", true); });
  }

  if (sessionLoading) return null;

  if (!session && !ENGAGEMENT_TEST_MODE) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-chalk px-4 font-body">
        <div className="w-full max-w-[420px] rounded-2xl border border-sand bg-white px-6 py-10 text-center">
          <Heart size={28} color={TERRACOTTA} className="mx-auto mb-2.5" />
          <h2 className="mb-2 mt-0 font-display text-xl text-forest">Sign in to see your bookmarks &amp; reviews</h2>
          <button
            onClick={() => navigate("/login")}
            className="mt-2 min-h-11 w-full rounded-[10px] bg-forest px-5 text-sm font-semibold text-white"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const visibleBookmarks = activeFolder === "all"
    ? bookmarks
    : bookmarks.filter((b) => b.folder_id === activeFolder);
  const meta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = meta.avatar_url || "";
  const firstName = meta.first_name || "";
  const initials = firstName
    ? (meta.first_name?.[0] || "") + (meta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) { notify("Folder name is required.", true); return; }
    const exists = folders.some((f) => f.name.toLowerCase() === name.toLowerCase());
    if (exists) { notify("A folder with this name already exists.", true); return; }
    try {
      await createFolder(name);
      setNewFolderName("");
      setCreatingFolder(false);
      refreshBookmarks();
      notify("Folder created successfully!");
    } catch (e) { notify(e.message, true); }
  }

  async function handleDeleteFolder(id) {
    try {
      await deleteFolder(id);
      if (activeFolder === id) setActiveFolder("all");
      refreshBookmarks();
    } catch (e) { notify(e.message, true); }
  }

  async function handleRemoveBookmark(vendorId) {
    try {
      await removeBookmark(vendorId);
      refreshBookmarks();
      notify("Vendor removed from wishlist.");
    } catch (e) { notify(e.message, true); }
  }

  async function handleMoveBookmark(vendorId, folderId) {
    try {
      await moveBookmark(vendorId, folderId);
      refreshBookmarks();
    } catch (e) { notify(e.message, true); }
  }

  // The vendor-detail modal is reachable from both the Bookmarks tab (always
  // bookmarked) and the Reviews tab (may or may not be) — so the heart there
  // needs to actually branch, unlike the plain "remove" hearts on the bookmark grid.
  function toggleBookmarkFromDetail(vendorId) {
    if (bookmarkedVendorIds.has(vendorId)) { handleRemoveBookmark(vendorId); return; }
    setPendingSaveVendor(detailVendor);
  }

  // Heart toggle for a vendor card outside the bookmark grid (e.g. the Reviews
  // tab), where the vendor may or may not already be bookmarked.
  function toggleBookmarkForVendor(vendor) {
    if (bookmarkedVendorIds.has(vendor.id)) { handleRemoveBookmark(vendor.id); return; }
    setPendingSaveVendor(vendor);
  }

  async function confirmSaveBookmark(folderId) {
    await addBookmark(pendingSaveVendor.id, folderId);
    setPendingSaveVendor(null);
    refreshBookmarks();
    notify("Vendor bookmarked!");
  }

  async function createFolderAndSave(name) {
    const { folder } = await createFolder(name);
    notify("Folder created successfully!");
    refreshBookmarks();
    await sleep(1200);
    await confirmSaveBookmark(folder.id);
  }

  return (
    <div className="min-h-dvh bg-chalk font-body text-ink">
      <DiscoveryHeader
        onOpenMap={() => navigate("/map?view=map")}
        session={session}
        userEmail={userEmail}
        initials={initials}
        firstName={firstName}
        avatarUrl={avatarUrl}
        savedCount={bookmarks.length}
        activeSection={tab === "reviews" ? "reviews" : "saved"}
        onOpenDiscover={() => navigate("/map")}
        onOpenSaved={() => { setTab("bookmarks"); navigate("/engagement"); }}
        onOpenReviews={() => { setTab("reviews"); navigate("/engagement?tab=reviews"); }}
        onLogin={() => navigate("/login")}
        onSignUp={() => navigate("/login")}
        onOpenProfile={() => navigate("/profile")}
      />

      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
        <div className="mb-6">
          <p className="mb-3 mt-0 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta">Your TrueBites collection</p>
          <h1 className="m-0 font-display text-[clamp(28px,5vw,44px)] font-medium leading-tight tracking-[-0.03em] text-ink">
            {tab === "reviews" ? "My reviews" : "Saved places"}
          </h1>
          <p className="mb-0 mt-2 text-sm text-muted">
            {tab === "reviews" ? "Keep track of the places and flavours you have shared." : "Keep the Melaka places you want to return to."}
          </p>
        </div>
        {tab === "bookmarks" && (
          <div className="flex flex-col gap-5">
            {/* Folder tabs — horizontal row, Instagram-style */}
            <div className="flex snap-x items-center gap-2 overflow-x-auto pb-2">
              <FolderPill label="All" count={bookmarks.length} active={activeFolder === "all"} onClick={() => setActiveFolder("all")} />
              {folders.map((f) => (
                <FolderPill
                  key={f.id} label={f.name}
                  count={bookmarks.filter((b) => b.folder_id === f.id).length}
                  active={activeFolder === f.id}
                  onClick={() => setActiveFolder(f.id)}
                  onDelete={!f.is_default ? () => setPendingDeleteFolder(f) : null}
                />
              ))}

              {creatingFolder ? (
                <div className="flex min-w-[260px] shrink-0 gap-1.5">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    placeholder="Folder name"
                    className="min-h-11 min-w-0 flex-1 rounded-full border border-sand px-3 text-[12.5px] outline-none focus:border-forest"
                  />
                  <button
                    onClick={handleCreateFolder}
                    className="min-h-11 shrink-0 rounded-full bg-forest px-4 text-[12.5px] text-white"
                  >
                    Create
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingFolder(true)}
                  className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-dashed border-sand px-3 text-[12.5px] text-muted"
                >
                  <Plus size={13} /> New folder
                </button>
              )}
            </div>

            <section>
              {visibleBookmarks.length === 0 ? (
                <Empty icon="🔖" text="No bookmarks in this folder yet." />
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleBookmarks.filter((b) => b.vendor).map((b) => (
                    <div key={b.vendor_id} className="flex flex-col gap-2">
                      <VendorCard
                        vendor={b.vendor}
                        inTrip={false}
                        bookmarked={true}
                        onToggleBookmark={() => handleRemoveBookmark(b.vendor_id)}
                        onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
                        onOpenDetail={setDetailVendor}
                      />
                      <FolderMoveSelect row={b} folders={folders} onMove={(folderId) => handleMoveBookmark(b.vendor_id, folderId)} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {tab === "reviews" && (
          <section>
            {reviews.filter((r) => r.vendor).length === 0 ? (
              <Empty icon="⭐" text="No reviews yet. Be the first to review!" />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {reviews.filter((r) => r.vendor).map((r) => (
                  <VendorCard
                    key={r.id}
                    vendor={r.vendor}
                    inTrip={false}
                    bookmarked={bookmarkedVendorIds.has(r.vendor.id)}
                    onToggleBookmark={() => toggleBookmarkForVendor(r.vendor)}
                    onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
                    onOpenDetail={setDetailVendor}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {detailVendor && (
        <VendorDetailModal
          vendor={detailVendor}
          inTrip={false}
          bookmarked={bookmarkedVendorIds.has(detailVendor.id)}
          onToggleBookmark={() => toggleBookmarkFromDetail(detailVendor.id)}
          onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
          onClose={() => setDetailVendor(null)}
        />
      )}

      {pendingSaveVendor && (
        <FolderPickerModal
          vendorName={pendingSaveVendor.name}
          folders={folders}
          onClose={() => setPendingSaveVendor(null)}
          onSave={confirmSaveBookmark}
          onCreateFolder={createFolderAndSave}
        />
      )}

      {pendingDeleteFolder && (
        <div
          onClick={() => setPendingDeleteFolder(null)}
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white p-5 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-w-[340px] sm:rounded-2xl"
          >
            <h3 className="mb-1.5 mt-0 font-display text-[17px] text-forest">Delete "{pendingDeleteFolder.name}"?</h3>
            <p className="mb-4 mt-0 text-[13px] text-muted">Its bookmarks will move to Default. This can't be undone.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setPendingDeleteFolder(null)}
                className="min-h-11 rounded-lg border border-sand bg-white px-4 text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleDeleteFolder(pendingDeleteFolder.id); setPendingDeleteFolder(null); }}
                className="min-h-11 rounded-lg bg-[#c0392b] px-4 text-[13px] font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}

const PILL = "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px]";

function FolderPill({ label, count, active, onClick, onDelete }) {
  return (
    <div className={active ? `${PILL} border-forest bg-forest text-white` : `${PILL} border-sand bg-white text-forest`}>
      <button type="button" onClick={onClick} className={active ? "flex min-h-11 min-w-11 items-center justify-center font-semibold" : "flex min-h-11 min-w-11 items-center justify-center"}>
        {label} <span className="text-[11px] opacity-75">{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete folder ${label}`}
          className="grid min-h-11 min-w-11 place-items-center opacity-60 hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

function FolderMoveSelect({ row, folders, onMove }) {
  if (folders.length === 0) return null;
  return (
    <div className="flex items-center gap-1 px-0.5">
      <FolderInput size={13} color={MUTED} />
      <select
        value={row.folder_id || ""}
        onChange={(e) => onMove(e.target.value || null)}
        className="min-h-11 min-w-0 flex-1 rounded-md border border-sand px-1.5 text-[11.5px] outline-none focus:border-forest"
      >
        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
    </div>
  );
}

function Empty({ icon, text }) {
  return (
    <div className="rounded-xl border border-sand bg-white px-5 py-12 text-center text-muted">
      <div className="mb-2 text-[32px]">{icon}</div>
      <div className="text-sm">{text}</div>
    </div>
  );
}
