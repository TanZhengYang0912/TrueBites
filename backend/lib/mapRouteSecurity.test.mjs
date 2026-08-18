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

  const authorization = createRoute.route.stack[0].handle;
  let nextCalled = false;
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await authorization({ headers: {} }, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body?.error, "Missing access token");
  assert.equal(nextCalled, false);
});
