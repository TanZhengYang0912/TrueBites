import { Router } from "express";
import express from "express";
import { supabase } from "../supabase.js";
import { logActivity } from "../lib/auditLog.js";

const router = Router();

const AVATAR_BUCKET = "avatars";
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function avatarPathFromUrl(url) {
  if (!url) return null;
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
}

// Resolves the caller's own user from their bearer token (never a client id).
async function userFromToken(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: "Missing access token" }); return null; }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) { res.status(401).json({ error: "Invalid or expired session" }); return null; }
  return data.user;
}

// Avatar upload — routed through the backend (three-tier) instead of the
// browser hitting Storage directly. Uploads to avatars/<userId>/… and writes
// the public URL back onto the user's metadata. A user can only ever change
// their own avatar because the folder is keyed to the verified token subject.
router.post("/profile/avatar", express.raw({ type: "image/*", limit: "8mb" }), async (req, res) => {
  const user = await userFromToken(req, res);
  if (!user) return;

  const ext = ALLOWED_IMAGE_TYPES[req.headers["content-type"]];
  if (!ext) return res.status(400).json({ error: "unsupported image type — use JPEG, PNG, WebP or GIF" });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "empty upload — send the raw image as the request body" });
  }

  const oldPath = avatarPathFromUrl(user.user_metadata?.avatar_url);
  const filePath = `${user.id}/${Date.now()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, req.body, { contentType: req.headers["content-type"], cacheControl: "31536000", upsert: false });
  if (uploadErr) return res.status(500).json({ error: "storage upload failed", details: uploadErr.message });

  const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, avatar_url: pub.publicUrl },
  });
  if (updateErr) return res.status(500).json({ error: "failed to update profile", details: updateErr.message });

  if (oldPath && oldPath !== filePath) {
    await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
  }

  await logActivity({ actor: user, action: "profile.avatar_update", entityType: "profile", entityId: user.id });

  res.status(201).json({ avatar_url: pub.publicUrl });
});

// Generic activity-logging endpoint for actions that happen entirely on the
// client via supabase-js (login, signup, password changes) — there's no
// other backend route in the request path for those, so the frontend calls
// this right after the Supabase Auth call succeeds. Actor is always the
// verified token subject, never a client-supplied id.
router.post("/log-event", async (req, res) => {
  const user = await userFromToken(req, res);
  if (!user) return;

  const action = String(req.body?.action || "").trim();
  if (!action) return res.status(400).json({ error: "action is required" });

  await logActivity({
    actor: user,
    action,
    entityType: "account",
    entityId: user.id,
    metadata: req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : null,
  });

  res.status(204).end();
});

// Called only after a failed password sign-in, to tell the "wrong password"
// case apart from "this account only ever signed up with Google, it has no
// password to get wrong". Deliberately reveals nothing else — a non-existent
// email gets the same { googleOnly: false } as a normal email/password
// account, so this can't be used to enumerate registered addresses beyond
// what a wrong-password error already implies.
router.post("/login-hint", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return res.json({ googleOnly: false });

  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    // listUsers() doesn't populate `identities` (it comes back null) — the
    // linked-provider list lives on app_metadata instead.
    const providers = user?.app_metadata?.providers || [];
    const googleOnly = providers.includes("google") && !providers.includes("email");

    res.json({ googleOnly });
  } catch {
    res.json({ googleOnly: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTH MODULE — Joshua
// Add authentication routes here (register, login, logout, etc.)
// ─────────────────────────────────────────────────────────────────────────────

// Permanently deletes the calling user's own Supabase auth account.
// Requires the user's access token (from the frontend session) so this can
// only ever delete the account making the request — never an arbitrary id.
router.delete("/account", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing access token" });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  // Logged before the delete — the actor row (auth.users) is gone once
  // deleteUser() succeeds, so this is the only chance to capture it.
  await logActivity({ actor: userData.user, action: "account.delete", entityType: "account", entityId: userData.user.id });

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return res.status(500).json({ error: deleteError.message });
  }

  res.json({ success: true });
});

export default router;
