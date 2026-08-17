// Not a "discovery" provider — an admin's own file upload is never searched
// for, it's just labelled consistently with whatever an automatic provider
// would produce, so every vendor_photos row (manual or automatic) carries the
// same source/provider vocabulary. Used by the existing POST /vendors/:id/image
// and /gallery routes.
export function describeManualUpload() {
  return { source: "manual", provider: "manual_upload" };
}
