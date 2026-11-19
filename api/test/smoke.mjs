/**
 * Local smoke test for the comment Worker.
 *
 *   node api/test/smoke.mjs
 *
 * It does not talk to Google: it mints an RSA key pair, serves it as a fake
 * JWKS endpoint, signs Google-shaped ID tokens with it, and drives the Worker
 * through a stubbed D1 binding. Run it after any change to src/index.js.
 */

import assert from "node:assert/strict";
import worker from "../src/index.js";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const SESSION_SECRET = "test-session-secret-0123456789abcdef";
const ORIGIN = "https://davidbai20100918-glitch.github.io";
const JWKS_URL = "https://jwks.test/certs";

/* ---------- fake Google key material ---------- */

const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"]
);

const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
const JWKS = {
  keys: [{ ...publicJwk, kid: "test-kid", alg: "RS256", use: "sig" }],
};

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === JWKS_URL) {
    return new Response(JSON.stringify(JWKS), {
      headers: { "content-type": "application/json" },
    });
  }
  return realFetch(input, init);
};

/* ---------- token minting ---------- */

const enc = new TextEncoder();
const b64u = (value) => Buffer.from(value).toString("base64url");

async function idToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: "test-kid", typ: "JWT" };
  const payload = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "user-1",
    email: "tester@example.com",
    email_verified: true,
    name: "Tester",
    picture: "https://example.com/a.png",
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  const head = b64u(enc.encode(JSON.stringify(header)));
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    enc.encode(`${head}.${body}`)
  );
  return `${head}.${body}.${b64u(new Uint8Array(signature))}`;
}

/* ---------- fake D1 ---------- */

const rows = [];
let lastInsert = 0;

const db = {
  prepare(sql) {
    const statement = {
      bind(...args) {
        return {
          async run() {
            if (sql.includes("INSERT INTO comments")) {
              lastInsert += 1;
              rows.push({ id: lastInsert, user_sub: args[0], body: args[1] });
              return { meta: { last_row_id: lastInsert, changes: 1 } };
            }
            if (sql.includes("DELETE FROM comments")) {
              const [id, sub] = args;
              const index = rows.findIndex((r) => r.id === id && r.user_sub === sub);
              if (index === -1) return { meta: { changes: 0 } };
              rows.splice(index, 1);
              return { meta: { changes: 1 } };
            }
            return { meta: {} };
          },
          async first() {
            return null; // no previous comment -> cooldown passes
          },
          async all() {
            return { results: [...rows].reverse() };
          },
        };
      },
      async run() {
        return { meta: {} };
      },
      async first() {
        return null;
      },
      async all() {
        return { results: [...rows].reverse() };
      },
    };
    return statement;
  },
};

const env = {
  DB: db,
  GOOGLE_CLIENT_ID: CLIENT_ID,
  ALLOWED_ORIGINS: ORIGIN,
  SESSION_SECRET,
  GOOGLE_JWKS_URL: JWKS_URL,
};

const call = (path, init = {}) =>
  worker.fetch(new Request(`https://api.test${path}`, init), env);

const pass = (label) => console.log(`  ok  ${label}`);

/* ---------- tests ---------- */

console.log("comment worker smoke test");

{
  const res = await call("/comments", {
    method: "OPTIONS",
    headers: { Origin: ORIGIN },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(res.headers.get("access-control-allow-headers"), /authorization/i);
  pass("CORS preflight");
}

let sessionToken;
{
  const res = await call("/login", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ credential: await idToken() }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.name, "Tester");
  assert.ok(data.token.split(".").length === 3);
  sessionToken = data.token;
  pass("login with a valid Google token");
}

{
  const res = await call("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: await idToken({ aud: "someone-else" }) }),
  });
  assert.equal(res.status, 401);
  pass("rejects a token minted for a different audience");
}

{
  const res = await call("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: await idToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
    }),
  });
  assert.equal(res.status, 401);
  pass("rejects an expired Google token");
}

{
  const res = await call("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: await idToken({ email_verified: false }) }),
  });
  assert.equal(res.status, 403);
  pass("rejects an unverified email");
}

{
  const token = await idToken();
  const [head, body] = token.split(".");
  const res = await call("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: `${head}.${body}.` }),
  });
  assert.equal(res.status, 401);
  pass("rejects a stripped signature");
}

{
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: "none", typ: "JWT" })));
  const body = b64u(
    enc.encode(
      JSON.stringify({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: "attacker",
        email_verified: true,
        exp: now + 3600,
      })
    )
  );
  const res = await call("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential: `${head}.${body}.` }),
  });
  assert.equal(res.status, 401);
  pass('rejects alg "none"');
}

{
  const res = await call("/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "no token here" }),
  });
  assert.equal(res.status, 401);
  pass("comment requires a session");
}

{
  const res = await call("/comments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ body: "Hard mode is brutal." }),
  });
  assert.equal(res.status, 201);
  pass("posts a comment with a session");
}

{
  const res = await call("/comments");
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].body, "Hard mode is brutal.");
  pass("lists comments");
}

{
  const res = await call("/me", {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.name, "Tester");
  pass("reads the session back");
}

{
  const tampered = sessionToken.slice(0, -2) + (sessionToken.endsWith("A") ? "BB" : "AA");
  const res = await call("/me", {
    headers: { Authorization: `Bearer ${tampered}` },
  });
  assert.equal(res.status, 401);
  pass("rejects a tampered session token");
}

{
  const res = await call("/comments", {
    headers: { Origin: "https://evil.example" },
  });
  assert.notEqual(res.headers.get("access-control-allow-origin"), "https://evil.example");
  pass("does not echo an unknown origin");
}

{
  const res = await call("/nothing-here");
  assert.equal(res.status, 404);
  pass("404 for unknown routes");
}

{
  const res = await call("/comments/999", { method: "DELETE" });
  assert.equal(res.status, 401);
  pass("delete requires a session");
}

{
  const res = await call("/comments/1", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  assert.equal(res.status, 200);
  pass("author deletes their own comment");
}

{
  const res = await call("/comments");
  const list = await res.json();
  assert.equal(list.length, 0);
  pass("deleted comment is gone from the list");
}

{
  const res = await call("/comments/1", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  assert.equal(res.status, 404);
  pass("deleting an already-deleted comment returns 404");
}

console.log("all checks passed");
