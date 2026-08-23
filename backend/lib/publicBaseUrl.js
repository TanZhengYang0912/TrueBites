export function resolvePublicBaseUrl({ configuredBaseUrl = "", protocol = "http", host = "" } = {}) {
  const configured = String(configuredBaseUrl || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const requestHost = String(host || "").trim();
  if (!requestHost) return "";

  return `${protocol || "http"}://${requestHost}`.replace(/\/+$/, "");
}
