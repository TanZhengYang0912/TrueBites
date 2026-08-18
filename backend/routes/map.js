import { Router } from "express";
import { supabase } from "../supabase.js";
import { haversine } from "../haversine.js";
import { fetchDrivingRoute } from "../lib/drivingRoute.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1 — GEOCODING (Address → Coordinates)
//
// Called ONCE when a restaurant is added. Coordinates are stored in Supabase
// and reused forever — never called on user search requests.
//
// POST /api/restaurants
// Body: { name: string, address: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/restaurants", requireRole("admin", "superadmin"), async (req, res) => {
  const { name, address } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: "name and address are required" });
  }

  const geoUrl =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`;

  let geoData;
  try {
    geoData = await (await fetch(geoUrl)).json();
  } catch (err) {
    return res.status(502).json({ error: "geocoding request failed", details: err.message });
  }

  if (geoData.status !== "OK") {
    return res.status(502).json({ error: "geocoding failed", status: geoData.status });
  }

  const { lat, lng } = geoData.results[0].geometry.location;

  const { data, error } = await supabase
    .from("vendors")
    .insert({
      vendor_name: name,
      address,
      latitude: lat,
      longitude: lng,
      location: `SRID=4326;POINT(${lng} ${lat})`,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: "database insert failed", details: error.message });
  }

  res.status(201).json(data);
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 — PROXIMITY SEARCH (Haversine in Node.js)
//
// Fetches all restaurants from Supabase, sorts by Haversine distance.
// Rough ETA shown before user selects a restaurant — real ETA from Module 3.
//
// GET /api/restaurants/nearby?lat=<user_lat>&lng=<user_lng>
// ─────────────────────────────────────────────────────────────────────────────
router.get("/restaurants/nearby", async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng query params are required" });
  }

  const userLat = parseFloat(lat);
  const userLng = parseFloat(lng);

  const { data: restaurants, error } = await supabase
    .from("vendors")
    .select(
      "id, vendor_name, address, latitude, longitude, location_precision, " +
      "cuisine_types, signature_dishes, price_range, ai_review_summary, " +
      "source_video_url, source_platform, average_rating, review_count, " +
      "storefront_image_url, gallery_image_urls, operating_hours_raw"
    )
    // Only approved vendors are shown to end users — draft/suspended vendors
    // stay invisible on the public map until an admin approves them.
    .eq("status", "active");

  if (error) {
    return res.status(500).json({ error: "database query failed", details: error.message });
  }

  const sorted = restaurants
    .filter((r) => r.latitude != null && r.longitude != null)
    .map((r) => {
      const distKm = haversine(userLat, userLng, r.latitude, r.longitude);
      return {
        ...r,
        name: r.vendor_name,
        lat: r.latitude,
        lng: r.longitude,
        distKm: parseFloat(distKm.toFixed(2)),
        roughEtaDriving: Math.round((distKm / 40) * 60),
        roughEtaWalking: Math.round((distKm / 5) * 60),
      };
    })
    .sort((a, b) => a.distKm - b.distKm);

  res.json(sorted);
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — ROUTE PLANNING & FINAL ETA (Google Directions API)
//
// Called ONLY when user taps "Start Navigation" on a specific restaurant.
// Returns real road distance, real ETA, and decoded path for the map polyline.
//
// GET /api/route?fromLat=&fromLng=&toLat=&toLng=
// ─────────────────────────────────────────────────────────────────────────────
router.get("/route", async (req, res) => {
  const { fromLat, fromLng, toLat, toLng } = req.query;
  if (!fromLat || !fromLng || !toLat || !toLng) {
    return res.status(400).json({ error: "fromLat, fromLng, toLat, toLng are required" });
  }

  const coordinates = [fromLat, fromLng, toLat, toLng].map(Number);
  if (coordinates.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: "route coordinates must be valid numbers" });
  }

  try {
    const [numericFromLat, numericFromLng, numericToLat, numericToLng] = coordinates;
    const route = await fetchDrivingRoute(
      {
        fromLat: numericFromLat,
        fromLng: numericFromLng,
        toLat: numericToLat,
        toLng: numericToLng,
      },
      { googleApiKey: GOOGLE_API_KEY },
    );
    res.json(route);
  } catch (error) {
    res.status(502).json({
      error: "directions failed",
      status: error.googleStatus,
      fallbackStatus: error.fallbackStatus,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — MULTI-STOP TRIP (free OSRM, no key)
//
// Routes through several stops. optimize=true suggests the best order
// (first stop kept as the anchor); optimize=false follows the given order.
// Powers the Map Visualization trip planner.
//
// POST /api/trip   Body: { points: [{lat,lng}, ...], optimize: boolean }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/trip", async (req, res) => {
  const { points, optimize = true } = req.body || {};
  if (!Array.isArray(points) || points.length < 2) {
    return res.status(400).json({ error: "need at least 2 points" });
  }

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const isTrip = optimize;
  const url = optimize
    ? `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=false&overview=full&geometries=geojson`
    : `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  try {
    const data = await (await fetch(url)).json();
    if (data.code !== "Ok") {
      return res.status(502).json({ error: "trip failed", details: data });
    }
    const leg = isTrip ? data.trips[0] : data.routes[0];

    let order = points.map((_, i) => i);
    if (isTrip) data.waypoints.forEach((wp, i) => { order[wp.waypoint_index] = i; });

    res.json({
      order,
      path: leg.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distance: (leg.distance / 1000).toFixed(1) + " km",
      duration: Math.round(leg.duration / 60) + " mins",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
