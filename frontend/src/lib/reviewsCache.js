let cachedReviews = null;

export function getCachedReviews() {
  return cachedReviews;
}

export function setCachedReviews(reviews) {
  cachedReviews = reviews;
}

// Clears the cache on sign-out so the next account doesn't see stale reviews.
export function clearReviewsCache() {
  cachedReviews = null;
}
