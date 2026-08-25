// Opt-in verbose logging for automatic photo discovery — off by default so
// normal admin usage stays quiet in the server console. Turn it on locally to
// see each provider's raw API response and how it scored, without sprinkling
// one-off console.log calls through the providers by hand every time someone
// needs to debug "why did/didn't this vendor get a photo".
//
// Enable: set PHOTO_DISCOVERY_DEBUG=1 in backend/.env, then restart the
// server (`npm run dev` — nodemon doesn't reread .env on its own).
const DEBUG = process.env.PHOTO_DISCOVERY_DEBUG === "1";

export function photoDebugLog(provider, vendorId, label, data) {
  if (!DEBUG) return;
  if (data === undefined) {
    console.log(`[photo-discovery:${provider}] vendor=${vendorId} ${label}`);
  } else {
    console.log(`[photo-discovery:${provider}] vendor=${vendorId} ${label}`, data);
  }
}
