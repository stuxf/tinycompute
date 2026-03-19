/**
 * E2E smoke tests for the MPP compute API.
 * Validates HTTP status codes and response shapes for free/unpaid paths.
 *
 * Usage: npx tsx scripts/test-e2e.ts [base-url]
 * Default base URL: http://localhost:3000
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  FAIL  ${name}\n        ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log(`\nRunning e2e tests against ${BASE}\n`);

  // 1. Health endpoint
  await test("GET /health returns 200 with { ok: true }", async () => {
    const res = await fetch(`${BASE}/health`);
    assert(res.status === 200, `expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.ok === true, `expected { ok: true }, got ${JSON.stringify(body)}`);
  });

  // 2. List machines without auth returns 401
  await test("GET /api/machines without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/machines`);
    assert(res.status === 401, `expected 401, got ${res.status}`);
    const body = await res.json();
    assert(body.error !== undefined, `expected error field in response`);
  });

  // 3. Create machine with invalid body returns 400 (validation runs before payment)
  await test("POST /api/machines with invalid body returns 400", async () => {
    const res = await fetch(`${BASE}/api/machines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test" }), // missing required config
    });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  // 3b. Create machine with valid body but no payment returns 402
  await test("POST /api/machines without payment returns 402", async () => {
    const res = await fetch(`${BASE}/api/machines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", config: { image: "nginx" } }),
    });
    assert(res.status === 402, `expected 402, got ${res.status}`);
  });

  // 4. Create volume with invalid body returns 400 (validation runs first)
  await test("POST /api/volumes with invalid body returns 400", async () => {
    const res = await fetch(`${BASE}/api/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  // 4b. Create volume with valid body but no payment returns 402
  await test("POST /api/volumes without payment returns 402", async () => {
    const res = await fetch(`${BASE}/api/volumes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test_vol", region: "sjc", size_gb: 1 }),
    });
    assert(res.status === 402, `expected 402, got ${res.status}`);
  });

  // 5. List volumes without auth returns 401
  await test("GET /api/volumes without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/volumes`);
    assert(res.status === 401, `expected 401, got ${res.status}`);
    const body = await res.json();
    assert(body.error !== undefined, `expected error field in response`);
  });

  // 6. Get machine without auth returns 401
  await test("GET /api/machines/:id without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/machines/fake-id`);
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  // 7. Allocate IP without payment returns 402
  await test("POST /api/apps/:name/ips without payment returns 402", async () => {
    const res = await fetch(`${BASE}/api/apps/test-app/ips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "shared_v4" }),
    });
    assert(res.status === 402, `expected 402, got ${res.status}`);
  });

  // 8. Create app without auth returns 401
  await test("POST /api/apps without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_name: "test", org_slug: "personal" }),
    });
    assert(res.status === 401, `expected 401, got ${res.status}`);
  });

  // 9. List IPs for app is free (no auth required)
  await test("GET /api/apps/:name/ips is free (no auth required, returns non-401)", async () => {
    const res = await fetch(`${BASE}/api/apps/test-app/ips`);
    // No auth required — server does not call requireWallet on this route.
    // Will either succeed (200) or fail with a Fly API error (proxied as non-401).
    assert(res.status !== 401, `expected non-401, got ${res.status}`);
  });

  // 10. Machine exec with invalid body returns 400 (validation before payment)
  await test("POST /api/machines/:id/exec with invalid body returns 400", async () => {
    const res = await fetch(`${BASE}/api/machines/fake-id/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // missing required command array
    });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  // 11. Extend volume with invalid body returns 400 (validation before payment)
  await test("PUT /api/volumes/:id/extend with invalid body returns 400", async () => {
    const res = await fetch(`${BASE}/api/volumes/fake-id/extend`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // missing required size_gb
    });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  // 12. Get machine billing info without auth returns 401
  await test("GET /api/machines/:id/billing without auth returns 401", async () => {
    const res = await fetch(`${BASE}/api/machines/fake-id/billing`);
    assert(res.status === 401, `expected 401, got ${res.status}`);
    const body = await res.json();
    assert(body.error !== undefined, `expected error field in response`);
  });

  // Summary
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(2);
});
