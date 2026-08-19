import { Router } from "express";
import express from "express";
import { Filter } from "bad-words";
import { supabase } from "../supabase.js";
import { logActivity } from "../lib/auditLog.js";
import { isSuspended } from "../lib/suspension.js";

const router = Router();

const REVIEW_PHOTO_BUCKET = "review-photos";
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_PHOTOS_PER_REVIEW = 4;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const filter = new Filter();

filter.removeWords("god", "hell", "bloody", "sex");

const MALAYSIAN_BADWORDS = [
  "babi", "sial", "bodoh", "bangang", "bengap", "celaka", "sohai", "bangsat",
  "tolol", "bongok", "jahanam", "bedebah", "haramjadah", "keparat",
  "asu", "jalang", "sundal", "gatal", "gian", "gatai", "pundek",
  "puki", "pukimak", "kimak", "konek", "kote", "pantat", "punai", "bontot",
  "jubur", "burit", "fuck","cibai", "chibai", "cheebye", "cb", "ccb", "lancau", "lanjiao",
  "lancaubabi", "diu", "diulei", "diulehlohmo", "knn", "kns", "kanina",
  "kanasai", "kolomoye", "kaniaseh", "hampalang", "siao", "gau", "lampa", "yier", "laosai",
  "thevidiya", "otha", "punda", "koothi", "pundachi",
  "wtf", "stfu", "ffs", "omfg", "af", "asf", "bullshit", "douchebag",
  "douche", "scumbag", "jackass", "fucktard", "shitface", "fuckface",
  "dipshit", "cockhead", "cumdumpster", "thot", "simp", "hoe", "coon",
  "spic", "chink", "gook", "tranny", "dyke",
];
filter.addWords(...MALAYSIAN_BADWORDS);

// Multi-word vulgar phrases — checked separately below, since these can't
// be matched by the single-word list above.
const MALAYSIAN_BADWORD_PHRASES = [
  "gila babi", "kepala hotak", "anak haram", "puki mak", "itik puki",
  "lubang pantat", "chao chee bye", "diu lei lo mo", "kanina lang",
  "chao chibai", "thevidiya paiya", "otha mavane", "son of a bitch",
  "motherfucking", "kepala baba kau",
];

const LEET_MAP = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s" };
function normalizeForDetection(word) {
  return word
    .toLowerCase()
    .split("")
    .map((ch) => LEET_MAP[ch] || ch)
    .join("")
    .replace(/(.)\1+/g, "$1");
}

// Checked against the base list, MALAYSIAN_BADWORDS (word by word), evasive
// spellings (via normalizeForDetection), and MALAYSIAN_BADWORD_PHRASES
// (against the full string, since those are multi-word).
function isProfaneLoose(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (MALAYSIAN_BADWORD_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  return text.split(/[^\p{L}\p{N}]+/u).some((word) => {
    if (!word) return false;
    return filter.isProfane(word) || filter.isProfane(normalizeForDetection(word));
  });
}

// Local-testing escape hatch: DISABLE_AUTH=true in backend/.env makes every
// engagement caller act as the fixed TEST_USER below (skips JWT verification
// and the ownership boundary). Unset (default) = real per-user verification.
const TEST_MODE = process.env.DISABLE_AUTH === "true";
const TEST_USER = {
  id: "78c8682a-102e-4925-a2c1-71144f4aaace",
  email: "engagement-test@truebites.local",
  user_metadata: { full_name: "Engagement Test User" },
};

async function requireUser(req, res) {
  if (TEST_MODE) return TEST_USER;

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Sign in required" });
    return null;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }
  return data.user;
}

// Same identity check as requireUser, plus a suspension gate — used only by
// mutating routes (save, review, vote). A suspended customer can still sign
// in and read everything (browse the discovery grid, view reviews); this is
// what stops them from writing anything while suspended. app_metadata isn't
// on the token's user object, so it takes a second lookup via the admin API.
async function requireActiveUser(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (TEST_MODE) return user;

  const { data, error } = await supabase.auth.admin.getUserById(user.id);
  if (!error && isSuspended(data?.user?.app_metadata)) {
    res.status(403).json({ error: "Your account is suspended and can't make changes right now." });
    return null;
  }
  return user;
}

// Optional auth — public review reads stay open, but a signed-in caller
// should still see their own hidden review in the list.
async function optionalUser(req) {
  if (TEST_MODE) return TEST_USER;

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const { data } = await supabase.auth.getUser(token);
  return data?.user || null;
}

async function getOrCreateDefaultFolder(userId) {
  const { data: existing } = await supabase
    .from("bookmark_folders")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("bookmark_folders")
    .insert({ user_id: userId, name: "Default", is_default: true })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// A review hidden for profanity still carries a genuine star rating from a
// real customer — only reviews an admin hid (fake/spam) are excluded, so the
// average reflects every real rating, not just the ones with visible text.
export async function recomputeVendorRating(vendorId) {
  const { data, error } = await supabase
    .from("reviews")
    .select("rating, is_hidden, hidden_reason")
    .eq("vendor_id", vendorId);
  if (error) throw error;

  const counted = data.filter((r) => !r.is_hidden || r.hidden_reason === "profanity");
  const count = counted.length;
  const average = count ? counted.reduce((sum, r) => sum + r.rating, 0) / count : null;

  const patch = { average_rating: average, review_count: count };
  await supabase.from("vendors").update(patch).eq("id", vendorId);
  return patch;
}

function storagePathFromUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${REVIEW_PHOTO_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
}

// ── Folders ─────────────────────────────────────────────────────────────────

router.get("/engagement/folders", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { data, error } = await supabase
    .from("bookmark_folders")
    .select("id, name, is_default, created_at")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  res.json({ folders: data });
});

router.post("/engagement/folders", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Folder name is required." });

  const { data, error } = await supabase
    .from("bookmark_folders")
    .insert({ user_id: user.id, name, is_default: false })
    .select("id, name, is_default, created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "A folder with this name already exists." });
    }
    return res.status(500).json({ error: "database insert failed", details: error.message });
  }

  await logActivity({ actor: user, action: "bookmark_folder.create", entityType: "bookmark_folder", entityId: data.id, metadata: { name } });
  res.status(201).json({ folder: data });
});

router.delete("/engagement/folders/:id", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const { data: folder, error: findErr } = await supabase
    .from("bookmark_folders")
    .select("id, is_default")
    .eq("id", req.params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: "database query failed", details: findErr.message });
  if (!folder) return res.status(404).json({ error: "Folder not found" });
  if (folder.is_default) return res.status(400).json({ error: "Can't delete the Default folder" });

  const defaultId = await getOrCreateDefaultFolder(user.id);
  await supabase
    .from("bookmarks")
    .update({ folder_id: defaultId })
    .eq("user_id", user.id)
    .eq("folder_id", folder.id);

  const { error } = await supabase.from("bookmark_folders").delete().eq("id", folder.id);
  if (error) return res.status(500).json({ error: "database delete failed", details: error.message });

  await logActivity({ actor: user, action: "bookmark_folder.delete", entityType: "bookmark_folder", entityId: folder.id });
  res.json({ deleted: true, id: folder.id });
});

// ── Bookmarks ───────────────────────────────────────────────────────────────

const BOOKMARK_SELECT = `
  vendor_id, folder_id, created_at,
  folder:bookmark_folders(id, name, is_default),
  vendor:vendors(id, vendor_name, address, latitude, longitude, cuisine_types,
    signature_dishes, price_range, ai_review_summary, source_video_url,
    source_platform, average_rating, review_count, storefront_image_url)
`;

router.get("/engagement/bookmarks", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { data, error } = await supabase
    .from("bookmarks")
    .select(BOOKMARK_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  res.json({
    bookmarks: (data || []).map((row) => ({
      ...row,
      vendor: row.vendor ? { ...row.vendor, id: row.vendor.id, name: row.vendor.vendor_name } : null,
    })),
  });
});

router.post("/engagement/bookmarks", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const vendorId = req.body?.vendor_id;
  if (!vendorId) return res.status(400).json({ error: "vendor_id is required" });

  let folderId = req.body?.folder_id || null;
  if (folderId) {
    const { data: folder } = await supabase
      .from("bookmark_folders")
      .select("id")
      .eq("id", folderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!folder) return res.status(404).json({ error: "Folder not found" });
  } else {
    folderId = await getOrCreateDefaultFolder(user.id);
  }

  const { data, error } = await supabase
    .from("bookmarks")
    .upsert({ user_id: user.id, vendor_id: vendorId, folder_id: folderId }, { onConflict: "user_id,vendor_id" })
    .select("vendor_id, folder_id, created_at")
    .single();
  if (error) return res.status(500).json({ error: "database insert failed", details: error.message });

  await logActivity({ actor: user, action: "bookmark.add", entityType: "vendor", entityId: vendorId, metadata: { folder_id: folderId } });
  res.status(201).json({ bookmark: data });
});

router.patch("/engagement/bookmarks/:vendorId", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  let folderId = req.body?.folder_id || null;
  folderId = folderId || (await getOrCreateDefaultFolder(user.id));

  const { data: folder } = await supabase
    .from("bookmark_folders")
    .select("id")
    .eq("id", folderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!folder) return res.status(404).json({ error: "Folder not found" });

  const { data, error } = await supabase
    .from("bookmarks")
    .update({ folder_id: folderId })
    .eq("user_id", user.id)
    .eq("vendor_id", req.params.vendorId)
    .select("vendor_id, folder_id")
    .single();
  if (error) return res.status(500).json({ error: "database update failed", details: error.message });
  if (!data) return res.status(404).json({ error: "Bookmark not found" });

  await logActivity({ actor: user, action: "bookmark.move", entityType: "vendor", entityId: req.params.vendorId, metadata: { folder_id: folderId } });
  res.json({ bookmark: data });
});

router.delete("/engagement/bookmarks/:vendorId", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("user_id", user.id)
    .eq("vendor_id", req.params.vendorId);
  if (error) return res.status(500).json({ error: "database delete failed", details: error.message });

  await logActivity({ actor: user, action: "bookmark.remove", entityType: "vendor", entityId: req.params.vendorId });
  res.json({ deleted: true });
});

// ── Reviews ─────────────────────────────────────────────────────────────────

function displayName(user) {
  return user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Anonymous";
}

function maskName(name) {
  if (!name) return "Anonymous";
  const chars = Array.from(name);
  if (chars.length <= 2) return chars[0] + "*".repeat(chars.length - 1);
  return chars[0] + "*".repeat(chars.length - 2) + chars[chars.length - 1];
}

router.get("/engagement/vendors/:vendorId/reviews", async (req, res) => {
  const caller = await optionalUser(req);

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id, user_id, rating, body, author_name, is_anonymous, is_hidden, hidden_reason, created_at, updated_at, review_photos(id, url)")
    .eq("vendor_id", req.params.vendorId)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  const visible = reviews.filter((r) => !r.is_hidden || r.user_id === caller?.id);
  const ids = visible.map((r) => r.id);

  const { data: votes } = ids.length
    ? await supabase.from("review_votes").select("review_id, user_id, is_like").in("review_id", ids)
    : { data: [] };

  const withVotes = visible.map((r) => {
    const reviewVotes = (votes || []).filter((v) => v.review_id === r.id);
    return {
      ...r,
      author_name: r.is_anonymous ? maskName(r.author_name) : r.author_name,
      isOwn: r.user_id === caller?.id,
      likes: reviewVotes.filter((v) => v.is_like).length,
      dislikes: reviewVotes.filter((v) => !v.is_like).length,
      myVote: caller ? reviewVotes.find((v) => v.user_id === caller.id)?.is_like ?? null : null,
    };
  });

  res.json({ reviews: withVotes });
});

router.get("/engagement/reviews/mine", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { data, error } = await supabase
    .from("reviews")
    .select(`
      id, vendor_id, rating, body, is_hidden, hidden_reason, created_at, updated_at, review_photos(id, url),
      vendor:vendors(id, vendor_name, address, latitude, longitude, cuisine_types,
        signature_dishes, price_range, ai_review_summary, source_video_url,
        source_platform, average_rating, review_count, storefront_image_url)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  res.json({
    reviews: (data || []).map((r) => ({
      ...r,
      vendor: r.vendor ? { ...r.vendor, id: r.vendor.id, name: r.vendor.vendor_name } : null,
    })),
  });
});

router.post("/engagement/vendors/:vendorId/reviews", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const rating = Number.parseInt(req.body?.rating, 10);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be an integer 1-5" });
  }
  const body = String(req.body?.body || "").trim() || null;
  const profane = body ? isProfaneLoose(body) : false;
  const isAnonymous = Boolean(req.body?.is_anonymous);

  const { data, error } = await supabase
    .from("reviews")
    .insert({
      user_id: user.id,
      vendor_id: req.params.vendorId,
      rating,
      body,
      author_name: displayName(user),
      is_anonymous: isAnonymous,
      is_hidden: profane,
      hidden_reason: profane ? "profanity" : null,
    })
    .select("id, rating, body, author_name, is_anonymous, is_hidden, hidden_reason, created_at, updated_at")
    .single();
  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return res.status(status).json({
      error: status === 409 ? "You've already reviewed this vendor — edit your existing review instead" : "database insert failed",
      details: error.message,
    });
  }

  const vendorStats = await recomputeVendorRating(req.params.vendorId);
  await logActivity({ actor: user, action: "review.create", entityType: "review", entityId: data.id, metadata: { vendor_id: req.params.vendorId, rating } });
  res.status(201).json({
    review: { ...data, author_name: data.is_anonymous ? maskName(data.author_name) : data.author_name, isOwn: true, likes: 0, dislikes: 0, myVote: null },
    vendor: vendorStats,
  });
});

router.patch("/engagement/reviews/:id", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const { data: existing, error: findErr } = await supabase
    .from("reviews")
    .select("id, user_id, vendor_id")
    .eq("id", req.params.id)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: "database query failed", details: findErr.message });
  if (!existing) return res.status(404).json({ error: "Review not found" });
  if (existing.user_id !== user.id) return res.status(403).json({ error: "You can only edit your own review" });

  const patch = { updated_at: new Date().toISOString() };
  if (req.body?.rating != null) {
    const rating = Number.parseInt(req.body.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "rating must be an integer 1-5" });
    }
    patch.rating = rating;
  }
  if (req.body?.body != null) {
    const body = String(req.body.body).trim() || null;
    patch.body = body;
    const profane = body ? isProfaneLoose(body) : false;
    patch.is_hidden = profane;
    patch.hidden_reason = profane ? "profanity" : null;
  }
  if (req.body?.is_anonymous != null) {
    patch.is_anonymous = Boolean(req.body.is_anonymous);
  }

  const { data, error } = await supabase
    .from("reviews")
    .update(patch)
    .eq("id", req.params.id)
    .select("id, rating, body, author_name, is_anonymous, is_hidden, hidden_reason, created_at, updated_at")
    .single();
  if (error) return res.status(500).json({ error: "database update failed", details: error.message });

  const vendorStats = await recomputeVendorRating(existing.vendor_id);
  await logActivity({ actor: user, action: "review.update", entityType: "review", entityId: existing.id, metadata: { vendor_id: existing.vendor_id } });
  res.json({
    review: { ...data, author_name: data.is_anonymous ? maskName(data.author_name) : data.author_name, isOwn: true },
    vendor: vendorStats,
  });
});

router.delete("/engagement/reviews/:id", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const { data: existing, error: findErr } = await supabase
    .from("reviews")
    .select("id, user_id, vendor_id")
    .eq("id", req.params.id)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: "database query failed", details: findErr.message });
  if (!existing) return res.status(404).json({ error: "Review not found" });
  if (existing.user_id !== user.id) return res.status(403).json({ error: "You can only delete your own review" });

  const { data: photos } = await supabase.from("review_photos").select("url").eq("review_id", existing.id);
  const { error } = await supabase.from("reviews").delete().eq("id", existing.id);
  if (error) return res.status(500).json({ error: "database delete failed", details: error.message });

  const paths = (photos || []).map((p) => storagePathFromUrl(p.url)).filter(Boolean);
  if (paths.length) await supabase.storage.from(REVIEW_PHOTO_BUCKET).remove(paths);

  const vendorStats = await recomputeVendorRating(existing.vendor_id);
  await logActivity({ actor: user, action: "review.delete", entityType: "review", entityId: existing.id, metadata: { vendor_id: existing.vendor_id } });
  res.json({ deleted: true, id: existing.id, vendor: vendorStats });
});

// ── Review photos ───────────────────────────────────────────────────────────

router.post(
  "/engagement/reviews/:id/photo",
  // Parsed one byte above the limit so an oversized upload lands here (as a
  // full buffer we can measure) instead of being rejected mid-stream by
  // raw-body with a bare HTML 413 the frontend can't read as JSON.
  express.raw({ type: "image/*", limit: `${MAX_PHOTO_BYTES + 1}b` }),
  async (req, res) => {
    const user = await requireActiveUser(req, res);
    if (!user) return;

    const ext = ALLOWED_IMAGE_TYPES[req.headers["content-type"]];
    if (!ext) return res.status(400).json({ error: "Only JPEG, PNG and WebP formats are allowed." });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "empty upload — send the raw image as the request body" });
    }
    if (req.body.length > MAX_PHOTO_BYTES) {
      return res.status(413).json({ error: "File size must be under 10MB." });
    }

    const { data: review, error: findErr } = await supabase
      .from("reviews")
      .select("id, user_id")
      .eq("id", req.params.id)
      .maybeSingle();
    if (findErr) return res.status(500).json({ error: "database query failed", details: findErr.message });
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.user_id !== user.id) return res.status(403).json({ error: "You can only add photos to your own review" });

    const { count } = await supabase
      .from("review_photos")
      .select("id", { count: "exact", head: true })
      .eq("review_id", review.id);
    if ((count || 0) >= MAX_PHOTOS_PER_REVIEW) {
      return res.status(400).json({ error: `A review can have at most ${MAX_PHOTOS_PER_REVIEW} photos` });
    }

    const filePath = `reviews/${review.id}/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(REVIEW_PHOTO_BUCKET)
      .upload(filePath, req.body, { contentType: req.headers["content-type"], cacheControl: "31536000", upsert: false });
    if (uploadErr) return res.status(500).json({ error: "storage upload failed", details: uploadErr.message });

    const { data: pub } = supabase.storage.from(REVIEW_PHOTO_BUCKET).getPublicUrl(filePath);

    const { data, error } = await supabase
      .from("review_photos")
      .insert({ review_id: review.id, url: pub.publicUrl })
      .select("id, url")
      .single();
    if (error) return res.status(500).json({ error: "database insert failed", details: error.message });

    await logActivity({ actor: user, action: "review.photo_upload", entityType: "review", entityId: review.id });
    res.status(201).json({ photo: data });
  }
);

// ── Votes ───────────────────────────────────────────────────────────────────

router.post("/engagement/reviews/:id/vote", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const isLike = req.body?.is_like;
  if (typeof isLike !== "boolean") return res.status(400).json({ error: "is_like must be a boolean" });

  const { data: review } = await supabase.from("reviews").select("id, user_id").eq("id", req.params.id).maybeSingle();
  if (!review) return res.status(404).json({ error: "Review not found" });
  if (review.user_id === user.id) return res.status(400).json({ error: "You can't vote on your own review" });

  const { error } = await supabase
    .from("review_votes")
    .upsert({ review_id: review.id, user_id: user.id, is_like: isLike }, { onConflict: "review_id,user_id" });
  if (error) return res.status(500).json({ error: "database insert failed", details: error.message });

  await logActivity({ actor: user, action: "review.vote", entityType: "review", entityId: review.id, metadata: { is_like: isLike } });
  res.json({ voted: true });
});

router.delete("/engagement/reviews/:id/vote", async (req, res) => {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const { error } = await supabase
    .from("review_votes")
    .delete()
    .eq("review_id", req.params.id)
    .eq("user_id", user.id);
  if (error) return res.status(500).json({ error: "database delete failed", details: error.message });

  await logActivity({ actor: user, action: "review.unvote", entityType: "review", entityId: req.params.id });
  res.json({ deleted: true });
});

// ── Notifications ───────────────────────────────────────────────────────────
// Newly published vendors. Capped server-side so a large backfill can never
// return hundreds of rows to a dropdown that shows fifteen.

const NOTIFICATION_LIMIT = 15;

router.get("/notifications", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { data: vendors, error } = await supabase
    .from("vendors")
    .select("id, vendor_name, cuisine_types, published_at")
    .eq("status", "active")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(NOTIFICATION_LIMIT);
  if (error) return res.status(500).json({ error: "database query failed", details: error.message });

  const { data: readRow, error: readErr } = await supabase
    .from("notification_reads")
    .select("last_seen_at, read_ids")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return res.status(500).json({ error: "database query failed", details: readErr.message });

  // The column is vendor_name; the customer UI reads `name` everywhere else
  // (see /restaurants/nearby in map.js). Match that rather than leaking the
  // database's column name into a third shape.
  res.json({
    notifications: vendors.map((v) => ({
      id: v.id,
      name: v.vendor_name,
      cuisine_types: v.cuisine_types,
      published_at: v.published_at,
    })),
    lastSeenAt: readRow?.last_seen_at || null,
    readIds: readRow?.read_ids || [],
  });
});

router.post("/notifications/seen", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  // The watermark now covers everything, so the per-item exceptions it
  // subsumes are dropped rather than left to grow.
  const lastSeenAt = new Date().toISOString();
  const { error } = await supabase
    .from("notification_reads")
    .upsert({ user_id: user.id, last_seen_at: lastSeenAt, read_ids: [] }, { onConflict: "user_id" });
  if (error) return res.status(500).json({ error: "database update failed", details: error.message });

  res.json({ lastSeenAt, readIds: [] });
});

// One notification opened. Read-modify-write rather than an atomic array
// append: this fires on a single user's click, so the lost-update window is a
// double-click on two different rows.
// ponytail: read-modify-write, move to an rpc with array_append if it ever races
router.post("/notifications/:id/read", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { data: row, error: readErr } = await supabase
    .from("notification_reads")
    .select("last_seen_at, read_ids")
    .eq("user_id", user.id)
    .maybeSingle();
  if (readErr) return res.status(500).json({ error: "database query failed", details: readErr.message });

  const readIds = [...new Set([...(row?.read_ids || []), req.params.id])];
  const { error } = await supabase
    .from("notification_reads")
    .upsert(
      { user_id: user.id, last_seen_at: row?.last_seen_at || new Date(0).toISOString(), read_ids: readIds },
      { onConflict: "user_id" }
    );
  if (error) return res.status(500).json({ error: "database update failed", details: error.message });

  res.json({ readIds });
});

// Demo control: drop the user's last-seen row so everything reads as unread
// again. No last-seen at all is exactly the state of a user who has never
// opened the bell, so the badge comes back without any special-casing.
router.delete("/notifications/seen", async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;

  const { error } = await supabase
    .from("notification_reads")
    .delete()
    .eq("user_id", user.id);
  if (error) return res.status(500).json({ error: "database delete failed", details: error.message });

  res.json({ lastSeenAt: null, readIds: [] });
});

export default router;
