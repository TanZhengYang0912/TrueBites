export const CUSTOMER_NOTIFICATION_LIMIT = 15;

function validTimestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function activationTimestamp(vendor) {
  const published = validTimestamp(vendor?.published_at);
  return Number.isFinite(published) ? published : validTimestamp(vendor?.created_at);
}

function compareActivationRecency(left, right) {
  return activationTimestamp(right) - activationTimestamp(left)
    || String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function selectFeedVendors(vendors = [], limit = CUSTOMER_NOTIFICATION_LIMIT) {
  return (Array.isArray(vendors) ? vendors : [])
    .filter((vendor) =>
      vendor?.status === "active"
      && vendor.latitude != null
      && vendor.longitude != null)
    .sort(compareActivationRecency)
    .slice(0, limit);
}

export function buildCustomerNotificationFeed(vendors = [], events = []) {
  const latestEventByVendor = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event?.vendor_id) continue;
    const current = latestEventByVendor.get(event.vendor_id);
    if (!current || validTimestamp(event.created_at) > validTimestamp(current.created_at)) {
      latestEventByVendor.set(event.vendor_id, event);
    }
  }

  return (Array.isArray(vendors) ? vendors : []).map((vendor) => {
    const event = latestEventByVendor.get(vendor.id);
    return {
      id: event?.id || vendor.id,
      type: event?.type || "new_vendor",
      vendor_id: vendor.id,
      name: vendor.vendor_name || "",
      cuisine_types: vendor.cuisine_types || null,
      published_at: vendor.published_at || vendor.created_at || null,
    };
  });
}
