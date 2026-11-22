import assert from "node:assert/strict";

const base = new URL(process.env.POLL_TEST_URL || "http://127.0.0.1:8787");
const key = process.env.POLL_TEST_HOST_KEY;
assert.equal(base.hostname, "127.0.0.1", "Use a local Worker for this check.");
assert.match(key || "", /^[0-9a-f]{64}$/, "Set POLL_TEST_HOST_KEY to your local host key.");

async function call(path, status, { method = "GET", data, authorized = false } = {}) {
  const headers = {};
  if (data) headers["Content-Type"] = "application/json";
  if (authorized) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(new URL(`/api/polls${path}`, base), {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body;
}

const host = (path, status, data) => call(path, status, { method: "POST", authorized: true, data });
const ballot = (id, code, project, status) => call(`/${id}/vote`, status, { method: "POST", data: { code, project } });
const projects = Array.from({ length: 12 }, (_, index) => `Project ${index + 1}`);
await call("", 401, { method: "POST", data: { title: "Untrusted", projects } });
await host("", 400, { title: "" });

const { id: audience } = await host("", 201, { title: "Audience choice" });
const { id: prize } = await host("", 201, { title: "Second jam prize" });
assert.notEqual(audience, prize);
assert.equal((await call(`/${audience}`, 200)).projects.length, 0);
await host(`/${audience}/open`, 409);
const { codes: [first, second] } = await host(`/${audience}/codes`, 200, { count: 2 });
const { codes: [prizeCode] } = await host(`/${prize}/codes`, 200, { count: 1 });
await host(`/${audience}/open`, 409);
await host(`/${audience}/projects`, 400, { projects: ["Atlas", " atlas "] });
assert.equal((await host(`/${audience}/projects`, 200, { projects })).projects.length, 12);
await host(`/${prize}/projects`, 200, { projects: ["Orbit", "Atlas"] });
await ballot(audience, first, 11, 409);
await host(`/${audience}/open`, 200);
await host(`/${prize}/open`, 200);
await host(`/${audience}/projects`, 409, { projects: ["Atlas", "Orbit"] });
await ballot(prize, first, 0, 403);
await ballot(audience, second, 12, 400);

const attempts = await Promise.allSettled([0, 11].map(async project => {
  const response = await fetch(new URL(`/api/polls/${audience}/vote`, base), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: first, project }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, project };
}));
const outcomes = attempts.map(attempt => {
  assert.equal(attempt.status, "fulfilled");
  return attempt.value;
});
assert.deepEqual(outcomes.map(outcome => outcome.status).sort(), [200, 409]);

await ballot(audience, second.toLowerCase().replaceAll("-", ""), 3, 200);
await ballot(prize, prizeCode, 1, 200);
assert.equal((await call(`/${audience}`, 200)).results, null);
const expected = projects.map(() => 0);
expected[outcomes.find(outcome => outcome.status === 200).project] = 1;
expected[3] = 1;
assert.deepEqual((await host(`/${audience}/close`, 200)).results, expected);
assert.deepEqual((await call(`/${audience}`, 200)).results, expected);
assert.equal((await call(`/${prize}`, 200)).phase, "open");
assert.deepEqual((await host(`/${prize}/close`, 200)).results, [0, 1]);
await host(`/${audience}/open`, 409);
await ballot(audience, second, 3, 409);

const qr = await fetch(new URL(`/api/polls/${audience}/qr`, base));
assert.equal(qr.status, 200);
assert.equal(qr.headers.get("Content-Type"), "image/svg+xml");
assert.match(await qr.text(), /^<svg[ >]/);
console.log("Passed two independent ballots, concurrent reuse, hidden tallies, host controls and QR generation.");
