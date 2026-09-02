import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import { parseMyAuditLogQuery, queryMyAuditLog } from "./myAuditLogQuery.js";

const ACTOR_ID = "current-admin";
const FROM = "2026-01-01T00:00:00.000Z";
const TO = "2026-02-01T00:00:00.000Z";

function makeClient({ data = [], count = 0, error = null } = {}) {
  const requests = [];
  const client = createClient("https://example.supabase.co", "test-service-key", {
    global: {
      fetch: async (input) => {
        requests.push(new URL(input));
        return new Response(JSON.stringify(error || data), {
          status: error ? 400 : 200,
          headers: {
            "content-type": "application/json",
            "content-range": `0-${Math.max(0, data.length - 1)}/${count ?? "*"}`,
          },
        });
      },
    },
  });
  return { client, requests };
}

test("parseMyAuditLogQuery applies defaults, trims search, and caps page size", () => {
  assert.deepEqual(parseMyAuditLogQuery({}), {
    page: 1,
    pageSize: 25,
    q: "",
    entity: "all",
    from: "",
    to: "",
    sort: "newest",
  });

  assert.deepEqual(parseMyAuditLogQuery({
    page: "2",
    pageSize: "999",
    q: "  vendor.update  ",
    entity: "vendor",
    from: FROM,
    to: TO,
    sort: "oldest",
  }), {
    page: 2,
    pageSize: 100,
    q: "vendor.update",
    entity: "vendor",
    from: FROM,
    to: TO,
    sort: "oldest",
  });
});

test("parseMyAuditLogQuery accepts URLSearchParams", () => {
  const parsed = parseMyAuditLogQuery(new URLSearchParams({
    page: "3",
    pageSize: "10",
    q: " review ",
    entity: "review",
  }));

  assert.equal(parsed.page, 3);
  assert.equal(parsed.pageSize, 10);
  assert.equal(parsed.q, "review");
  assert.equal(parsed.entity, "review");
});

test("parseMyAuditLogQuery rejects invalid filters with status 400", () => {
  assert.throws(
    () => parseMyAuditLogQuery({ sort: "random" }),
    (error) => error.status === 400 && /sort/i.test(error.message),
  );
  assert.throws(
    () => parseMyAuditLogQuery({ entity: "accounts" }),
    (error) => error.status === 400 && /entity/i.test(error.message),
  );
  assert.throws(
    () => parseMyAuditLogQuery({ q: "x".repeat(101) }),
    (error) => error.status === 400 && /search/i.test(error.message),
  );
  assert.throws(
    () => parseMyAuditLogQuery({ from: FROM }),
    (error) => error.status === 400 && /date/i.test(error.message),
  );
  assert.throws(
    () => parseMyAuditLogQuery({ from: "2026-01-01T00:00:00Z", to: TO }),
    (error) => error.status === 400 && /date/i.test(error.message),
  );
  assert.throws(
    () => parseMyAuditLogQuery({ from: TO, to: FROM }),
    (error) => error.status === 400 && /date/i.test(error.message),
  );
});

test("queryMyAuditLog projects display fields and builds scoped filtered query", async () => {
  const { client, requests } = makeClient({
    count: 2,
    data: [{
      id: "audit-1",
      action: "vendor.update",
      entity_type: "vendor",
      entity_id: "vendor-1",
      created_at: "2026-01-10T00:00:00.000Z",
      metadata: { private: "must not escape" },
    }],
  });

  const result = await queryMyAuditLog(client, ACTOR_ID, parseMyAuditLogQuery({
    page: "2",
    pageSize: "25",
    q: "  vendor  ",
    entity: "vendor",
    from: FROM,
    to: TO,
    sort: "oldest",
  }));

  assert.deepEqual(result, {
    items: [{
      id: "audit-1",
      action: "vendor.update",
      entityType: "vendor",
      entityId: "vendor-1",
      createdAt: "2026-01-10T00:00:00.000Z",
    }],
    pagination: { page: 2, pageSize: 25, total: 2, totalPages: 1 },
  });

  assert.equal(requests.length, 1);
  const url = requests[0];
  assert.equal(url.searchParams.get("select"), "id,action,entity_type,entity_id,created_at");
  assert.equal(url.searchParams.get("actor_id"), `eq.${ACTOR_ID}`);
  assert.equal(url.searchParams.get("entity_type"), "eq.vendor");
  assert.deepEqual(url.searchParams.getAll("created_at"), [`gte.${FROM}`, `lt.${TO}`]);
  assert.equal(url.searchParams.get("order"), "created_at.asc,id.asc");
  assert.equal(url.searchParams.get("offset"), "25");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.has("metadata"), false);
  assert.equal(url.searchParams.get("select")?.includes("metadata"), false);
  assert.match(url.searchParams.get("or") || "", /action\.imatch\./);
  assert.match(url.searchParams.get("or") || "", /entity_type\.imatch\./);
});

test("queryMyAuditLog escapes literal punctuation and wildcard characters", async () => {
  const { client, requests } = makeClient();
  const q = `a,b.*%_\\\"'()`;

  await queryMyAuditLog(client, ACTOR_ID, parseMyAuditLogQuery({ q }));

  const or = requests[0].searchParams.get("or");
  assert.ok(or, "expected an OR filter");
  assert.equal((or.match(/action\.imatch\./g) || []).length, 1);
  assert.equal((or.match(/entity_type\.imatch\./g) || []).length, 1);
  assert.equal(or.includes("metadata"), false);
  assert.match(or, /\\\\/);
  assert.match(or, /\\%/);
  assert.match(or, /\\_/);
  assert.match(or, /\\\*/);
  assert.match(or, /\\\"/);
  assert.match(or, /a,b/);
});

test("queryMyAuditLog adds an exact entity UUID clause without changing actor scope", async () => {
  const { client, requests } = makeClient();
  const uuid = "78c8682a-102e-4925-a2c1-71144f4aaace";

  await queryMyAuditLog(client, ACTOR_ID, parseMyAuditLogQuery({
    q: uuid,
    entity: "all",
    sort: "newest",
  }));

  const url = requests[0];
  const or = url.searchParams.get("or") || "";
  assert.equal(url.searchParams.get("actor_id"), `eq.${ACTOR_ID}`);
  assert.ok(or.includes(`entity_id.eq.${uuid}`));
  assert.doesNotMatch(or, /entity_id\.ilike\./);
  assert.equal(url.searchParams.has("entity_type"), false);
  assert.equal(url.searchParams.get("order"), "created_at.desc,id.asc");
});

test("queryMyAuditLog leaves unknown entity values visible under all", async () => {
  const row = {
    id: "audit-future",
    action: "future.event",
    entity_type: "future_entity",
    entity_id: "future-1",
    created_at: "2026-01-10T00:00:00.000Z",
  };
  const { client, requests } = makeClient({ data: [row], count: 1 });

  const result = await queryMyAuditLog(client, ACTOR_ID, parseMyAuditLogQuery({ q: "future" }));

  assert.equal(result.items[0].entityType, "future_entity");
  assert.equal(requests[0].searchParams.has("entity_type"), false);
  assert.match(requests[0].searchParams.get("or") || "", /future/);
});

test("queryMyAuditLog propagates database errors for the route to sanitize", async () => {
  const { client } = makeClient({ error: { message: "backend secret" } });

  await assert.rejects(
    () => queryMyAuditLog(client, ACTOR_ID, parseMyAuditLogQuery({})),
    (error) => error?.message === "backend secret",
  );
});
