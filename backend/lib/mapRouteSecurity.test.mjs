import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_KEY ||= "test-service-key";
delete process.env.DISABLE_AUTH;

test("creating a restaurant requires an admin role before the handler runs", async () => {
  const { default: router } = await import("../routes/map.js");
  const createRoute = router.stack.find(
    (layer) => layer.route?.path === "/restaurants" && layer.route.methods.post,
  );

  assert.ok(createRoute, "POST /restaurants route should exist");
  assert.ok(
    createRoute.route.stack.length >= 2,
    "POST /restaurants must run authorization middleware before its handler",
  );
});
