/**
 * Cloudflare Worker that backs the comment section of the Connect 4 site.
 *
 * Zero dependencies — everything uses the WebCrypto API that Workers ships
 * with, so this file can be pasted straight into the Cloudflare dashboard.
 *
 * Flow
 *   1. Browser gets a Google ID token (a signed JWT) from Google Identity
 *      Services.
 *   2. POST /login: we verify that token against Google's published public
 *      keys, then issue our own 7-day session token.
 *   3. POST /comments with `Authorization: Bearer <session token>`.
 *
 * No cookies: the site runs on *.github.io and this API on *.workers.dev, so
 * a cookie would be a third-party cookie and Safari/Firefox would drop it.
 *
 * Bindings required:
 *   DB                    D1 database
 *   GOOGLE_CLIENT_ID      var  (the OAuth client id, public value)
 *   ALLOWED_ORIGINS       var  (comma separated, e.g. https://you.github.io)
 *   SESSION_SECRET        secret (32+ random bytes, base64)
 */

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const MAX_COMMENT = 1000;
const SESSION_DAYS = 7;
const COOLDOWN_SECONDS = 10;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/login" && request.method === "POST") {
        return await login(request, env, cors);
      }
      if (url.pathname === "/me" && request.method === "GET") {
        return await me(request, env, cors);
      }
      if (url.pathname === "/comments" && request.method === "GET") {
        return await listComments(request, env, cors);
      }
      if (url.pathname === "/comments" && request.method === "POST") {
        return await addComment(request, env, cors);
      }
      const one = url.pathname.match(/^\/comments\/(\d+)$/);
      if (one && request.method === "DELETE") {
        return await deleteComment(request, env, cors, Number(one[1]));
      }
      if (url.pathname === "/" || url.pathname === "") {
        return json({ ok: true, service: "connect4-comments" }, 200, cors);
      }
      return json({ error: "not found" }, 404, cors);
    } catch (err) {
      console.error("unhandled", err);
      return json({ error: "server error" }, 500, cors);
    }
  },
};

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

async function login(request, env, cors) {
  let credential;
  try {
    ({ credential } = await request.json());
  } catch {
    return json({ error: "invalid json" }, 400, cors);
  }
  if (typeof credential !== "string" || credential.length > 4096) {
    return json({ error: "missing credential" }, 400, cors);
  }

  let claims;
  try {
    claims = await verifyGoogleIdToken(credential, env);
  } catch (err) {
    console.warn("google token rejected:", err.message);
    return json({ error: "invalid google token" }, 401, cors);
  }

  // Kept out of verifyGoogleIdToken so the client can tell "bad token" (401)
  // apart from "good token, unusable account" (403).
  if (claims.email_verified !== true) {
    return json({ error: "email not verified" }, 403, cors);
  }

  const user = {
    sub: claims.sub,
    name: claims.name || "Player",
    email: claims.email || null,
    picture: claims.picture || null,
  };

  await env.DB.prepare(
    `INSERT INTO users (sub, name, email, picture) VALUES (?, ?, ?, ?)
     ON CONFLICT(sub) DO UPDATE SET
       name = excluded.name,
       email = excluded.email,
       picture = excluded.picture`
  )
    .bind(user.sub, user.name, user.email, user.picture)
    .run();

  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const token = await signSession(
    { sub: user.sub, name: user.name, picture: user.picture, exp },
    env.SESSION_SECRET
  );

  return json(
    { token, exp, user: { name: user.name, picture: user.picture } },
    200,
    cors
  );
}

async function me(request, env, cors) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "not signed in" }, 401, cors);
  return json(
    { name: session.name, picture: session.picture, exp: session.exp },
    200,
    { ...cors, "Cache-Control": "no-store" }
  );
}

async function listComments(request, env, cors) {
  // The session is optional here: signed-out visitors can read comments, they
  // just do not get the `mine` flag that drives the delete button.
  const session = await readSession(request, env);

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.user_sub, c.body, c.created_at, u.name, u.picture
       FROM comments c
       JOIN users u ON u.sub = c.user_sub
      ORDER BY c.id DESC
      LIMIT 100`
  ).all();

  const rows = (results ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    name: row.name,
    picture: row.picture,
    mine: Boolean(session && row.user_sub === session.sub),
  }));

  return json(rows, 200, { ...cors, "Cache-Control": "no-store" });
}

async function deleteComment(request, env, cors, id) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "sign in required" }, 401, cors);

  // Scoping the DELETE by user_sub is what stops one user deleting another
  // user's comment by guessing ids.
  const result = await env.DB.prepare(
    `DELETE FROM comments WHERE id = ? AND user_sub = ?`
  )
    .bind(id, session.sub)
    .run();

  const changed = result?.meta?.changes ?? 0;
  if (!changed) return json({ error: "comment not found" }, 404, cors);

  return json({ deleted: id }, 200, cors);
}

async function addComment(request, env, cors) {
  const session = await readSession(request, env);
  if (!session) return json({ error: "sign in required" }, 401, cors);

  let body;
  try {
    ({ body } = await request.json());
  } catch {
    return json({ error: "invalid json" }, 400, cors);
  }

  const text = String(body ?? "").trim();
  if (!text) return json({ error: "comment is empty" }, 400, cors);
  if (text.length > MAX_COMMENT) {
    return json(
      { error: `comments are limited to ${MAX_COMMENT} characters` },
      400,
      cors
    );
  }

  // Cheap per-user flood guard.
  const recent = await env.DB.prepare(
    `SELECT 1 AS hit FROM comments
      WHERE user_sub = ? AND created_at > datetime('now', ?)
      LIMIT 1`
  )
    .bind(session.sub, `-${COOLDOWN_SECONDS} seconds`)
    .first();

  if (recent) {
    return json({ error: "You're posting too fast, take a breath." }, 429, cors);
  }

  const result = await env.DB.prepare(
    `INSERT INTO comments (user_sub, body) VALUES (?, ?)`
  )
    .bind(session.sub, text)
    .run();

  return json({ id: result.meta.last_row_id }, 201, cors);
}

/* ------------------------------------------------------------------ *
 * Google ID token verification
 * ------------------------------------------------------------------ */

let jwksCache = { keys: null, expires: 0 };

async function googleKeys(env, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && jwksCache.keys && now < jwksCache.expires) {
    return jwksCache.keys;
  }

  const response = await fetch(env.GOOGLE_JWKS_URL || GOOGLE_JWKS_URL);
  if (!response.ok) throw new Error("could not fetch google keys");

  const data = await response.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  if (!keys.length) throw new Error("google returned no keys");

  jwksCache = { keys, expires: now + 60 * 60 * 1000 };
  return keys;
}

async function verifyGoogleIdToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [rawHeader, rawPayload, rawSignature] = parts;

  const header = decodeJson(rawHeader);
  // Pin the algorithm. Accepting whatever the token claims is the classic
  // JWT vulnerability ("alg": "none").
  if (header.alg !== "RS256") throw new Error("unsupported alg");

  const signedData = encoder.encode(`${rawHeader}.${rawPayload}`);
  const signature = b64urlDecode(rawSignature);

  let keys = await googleKeys(env);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Google rotates keys; refetch once before giving up.
    keys = await googleKeys(env, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("unknown signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signedData
  );
  if (!valid) throw new Error("bad signature");

  const claims = decodeJson(rawPayload);
  const now = Math.floor(Date.now() / 1000);

  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("bad issuer");
  }
  // Without this check, any valid Google token — including one minted for a
  // completely different website — would be accepted here.
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw new Error("bad audience");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("expired");
  if (typeof claims.iat === "number" && claims.iat > now + 300) throw new Error("issued in the future");
  if (!claims.sub) throw new Error("no subject");

  return claims;
}

/* ------------------------------------------------------------------ *
 * Session tokens (HS256)
 * ------------------------------------------------------------------ */

async function signSession(payload, secret) {
  const header = b64urlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlEncodeString(JSON.stringify(payload));
  const data = encoder.encode(`${header}.${body}`);
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), data);
  return `${header}.${body}.${b64urlEncode(signature)}`;
}

async function readSession(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const [rawHeader, rawPayload, rawSignature] = parts;
    const head = decodeJson(rawHeader);
    if (head.alg !== "HS256") return null;

    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(env.SESSION_SECRET, ["verify"]),
      b64urlDecode(rawSignature),
      encoder.encode(`${rawHeader}.${rawPayload}`)
    );
    if (!valid) return null;

    const claims = decodeJson(rawPayload);
    const now = Math.floor(Date.now() / 1000);
    if (!claims.sub) return null;
    if (typeof claims.exp !== "number" || claims.exp <= now) return null;

    return claims;
  } catch {
    return null;
  }
}

async function hmacKey(secret, usages) {
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const permit = allowed.includes(origin) ? origin : allowed[0] || "";

  return {
    "Access-Control-Allow-Origin": permit,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function b64urlDecode(input) {
  const normalised = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeString(value) {
  return b64urlEncode(encoder.encode(value));
}

function decodeJson(segment) {
  return JSON.parse(decoder.decode(b64urlDecode(segment)));
}

function json(data, status, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
