export function requireDashboardData(result, section) {
  if (result?.error) {
    const error = new Error(`Failed to load dashboard ${section}`);
    error.cause = result.error;
    throw error;
  }
  return result?.data || [];
}
