export const NEW_VENDOR_NOTIFICATION = "new_vendor";
export const VENDOR_REACTIVATED_NOTIFICATION = "vendor_reactivated";

export function notificationTypeForActivation({ previousStatus, nextStatus, publishedAt }) {
  const previous = String(previousStatus || "").toLowerCase();
  const next = String(nextStatus || "").toLowerCase();

  if (next !== "active" || previous === "active") return null;
  return publishedAt ? VENDOR_REACTIVATED_NOTIFICATION : NEW_VENDOR_NOTIFICATION;
}
