import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Plus } from "lucide-react";
import { useSession } from "../lib/SessionContext";
import {
  getBookmarks, getFolders, addBookmark, removeBookmark, moveBookmark, createFolder, deleteFolder,
} from "../api/engagement";
import Toast from "../components/engagement/Toast";
import DiscoveryPageShell from "../components/discovery/DiscoveryPageShell";
import DiscoveryPageIntro from "../components/discovery/DiscoveryPageIntro";
import { useToast, sleep } from "../lib/useToast";
import VendorCard from "../components/discovery/VendorCard";
import { customerSession } from "../lib/roles";
import VendorDetailModal from "../components/discovery/VendorDetailModal";
import FolderPickerModal from "../components/engagement/FolderPickerModal";
import { Empty, FolderMoveSelect, FolderPill, Pagination } from "../components/engagement/EngagementPageControls";
import { ENGAGEMENT_TEST_MODE } from "../lib/testMode";

const TERRACOTTA = "#A35D47";
const PAGE_SIZE = 6;
// Cards in the same grid row can have different natural heights (e.g. the star-rating
// line only renders for vendors with reviews). The grid already stretches each row's
// wrapper divs to match the tallest one — this just lets VendorCard's <article> grow
// into that stretched height too, without forcing its own internals into a flex layout
// (that previously fought with the photo's aspect-ratio box and blew it up to full size).
const CARD_STRETCH = "[&>article]:flex-1";
// Fuses the (shared, untouched) VendorCard with a page-specific footer strip
// below it — squares off the card's bottom edge and cancels its hover-lift so
// the footer reads as part of one card instead of a stray line floating under it.
const CARD_MERGE_FOOTER = "[&>article]:rounded-b-none [&>article]:border-b-0 [&>article]:hover:translate-y-0";

export default function SavedPage() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const session = customerSession(authSession);

  const [bookmarks, setBookmarks] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [bookmarkPage, setBookmarkPage] = useState(1);

  const [detailVendor, setDetailVendor] = useState(null);
  const [pendingSaveVendor, setPendingSaveVendor] = useState(null); // vendor awaiting a folder pick
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState(null); // folder awaiting delete confirmation
  const [pendingUnbookmarkVendor, setPendingUnbookmarkVendor] = useState(null); // vendor awaiting unbookmark confirmation
  const [toast, notify] = useToast();
  const bookmarkedVendorIds = new Set(bookmarks.map((b) => b.vendor_id));

  useEffect(() => {
    if (!session && !ENGAGEMENT_TEST_MODE) return;
    refreshBookmarks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => { setBookmarkPage(1); }, [activeFolder]);

  function refreshBookmarks() {
    getFolders().then((f) => setFolders(f.folders)).catch((e) => { console.error(e.message); notify("Couldn't load your folders.", true); });
    getBookmarks().then((b) => setBookmarks(b.bookmarks)).catch((e) => { console.error(e.message); notify("Couldn't load your bookmarks.", true); });
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

  const visibleBookmarks = (activeFolder === "all"
    ? bookmarks
    : bookmarks.filter((b) => b.folder_id === activeFolder)
  ).filter((b) => b.vendor);
  const bookmarkPageCount = Math.max(1, Math.ceil(visibleBookmarks.length / PAGE_SIZE));
  const pagedBookmarks = visibleBookmarks.slice((bookmarkPage - 1) * PAGE_SIZE, bookmarkPage * PAGE_SIZE);

  const meta = session?.user?.user_metadata || {};
  const userEmail = session?.user?.email || "";
  const avatarUrl = meta.avatar_url || "";
  const firstName = meta.first_name || "";
  const initials = firstName
    ? (meta.first_name?.[0] || "") + (meta.last_name?.[0] || "")
    : (userEmail ? userEmail.slice(0, 2).toUpperCase() : "?");

  function handleCancelCreateFolder() {
    setNewFolderName("");
    setCreatingFolder(false);
  }

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
    if (bookmarkedVendorIds.has(vendorId)) { setPendingUnbookmarkVendor(detailVendor); return; }
    setPendingSaveVendor(detailVendor);
  }

  async function confirmUnbookmark() {
    const vendorId = pendingUnbookmarkVendor.id;
    setPendingUnbookmarkVendor(null);
    await handleRemoveBookmark(vendorId);
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

  function patchVendorStats(vendorId, patch) {
    setBookmarks((cur) => cur.map((b) => (b.vendor_id === vendorId ? { ...b, vendor: { ...b.vendor, ...patch } } : b)));
    setDetailVendor((cur) => (cur && cur.id === vendorId ? { ...cur, ...patch } : cur));
  }

  return (
    <>
      <DiscoveryPageShell
      headerProps={{
        session,
        userEmail,
        initials,
        firstName,
        avatarUrl,
        savedCount: bookmarks.length,
        activeSection: "saved",
        onLogin: () => navigate("/login"),
        onSignUp: () => navigate("/login?mode=signup"),
        onOpenProfile: () => navigate("/profile"),
        onOpenVendor: (id) => navigate(`/discover?vendor=${id}`),
      }}
      >
        <DiscoveryPageIntro
          eyebrow="Your TrueBites collection"
          title="Saved places"
          description="Keep the Melaka places you want to return to."
        />
        <div className="flex flex-col gap-5">
            {/* Folder tabs — horizontal row, Instagram-style */}
            <div className="no-scrollbar flex snap-x items-center gap-2 overflow-x-auto scroll-smooth pb-2">
              {creatingFolder ? (
                <div className="flex min-w-[320px] shrink-0 gap-1.5">
                  <input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                    placeholder="Folder name"
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-sand px-3 text-[12.5px] outline-none focus:border-forest"
                  />
                  <button
                    onClick={handleCancelCreateFolder}
                    className="min-h-11 shrink-0 rounded-md border border-muted bg-white px-4 text-[12.5px] font-semibold text-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    className="min-h-11 shrink-0 rounded-md bg-terracotta px-4 text-[12.5px] font-semibold text-white"
                  >
                    Create
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setCreatingFolder(true)}
                  aria-label="New folder"
                  title="New folder"
                  className="flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-sand bg-white px-3 text-[13px] text-forest"
                >
                  <Plus size={13} />
                </button>
              )}

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
            </div>

            <section className="flex flex-col gap-5">
              {visibleBookmarks.length === 0 ? (
                <Empty icon="🔖" text="No bookmarks in this folder yet." />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {pagedBookmarks.map((b) => (
                      <div key={b.vendor_id} className={`flex flex-col ${CARD_STRETCH} ${CARD_MERGE_FOOTER}`}>
                        <VendorCard
                          vendor={b.vendor}
                          inTrip={false}
                          bookmarked={true}
                          onToggleBookmark={() => setPendingUnbookmarkVendor(b.vendor)}
                          onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
                          onOpenDetail={setDetailVendor}
                        />
                        <FolderMoveSelect row={b} folders={folders} onMove={(folderId) => handleMoveBookmark(b.vendor_id, folderId)} />
                      </div>
                    ))}
                  </div>
                  <Pagination page={bookmarkPage} totalPages={bookmarkPageCount} onChange={setBookmarkPage} />
                </>
              )}
            </section>
        </div>
      </DiscoveryPageShell>

      {detailVendor && (
        <VendorDetailModal
          key={detailVendor.id}
          vendor={detailVendor}
          inTrip={false}
          bookmarked={bookmarkedVendorIds.has(detailVendor.id)}
          onToggleBookmark={() => toggleBookmarkFromDetail(detailVendor.id)}
          onAddStop={() => notify("Open this vendor from the map to add it to your trip.")}
          onClose={() => setDetailVendor(null)}
          onVendorUpdated={patchVendorStats}
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

      {pendingUnbookmarkVendor && (
        <div
          onClick={() => setPendingUnbookmarkVendor(null)}
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-forest/60 p-0 animate-backdrop-in sm:items-center sm:p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-white p-5 shadow-[0_20px_60px_rgba(64,84,74,0.35)] animate-modal-in sm:max-w-[340px] sm:rounded-2xl"
          >
            <h3 className="mb-1.5 mt-0 font-display text-[17px] text-forest">Remove "{pendingUnbookmarkVendor.name}"?</h3>
            <p className="mb-4 mt-0 text-[13px] text-muted">This will remove it from your saved places.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setPendingUnbookmarkVendor(null)}
                className="min-h-11 rounded-lg border border-sand bg-white px-4 text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmUnbookmark}
                className="min-h-11 rounded-lg bg-[#c0392b] px-4 text-[13px] font-semibold text-white"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </>
  );
}
