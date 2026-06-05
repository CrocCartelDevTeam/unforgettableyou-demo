"use strict";
/* Auth primitives: HMAC-signed session tokens + scrypt password hashing.
   Dependency-free (Node crypto only). Used by the serverless API. */
const crypto = require("crypto");

const SECRET = process.env.UY_SESSION_SECRET || "";

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function fromB64url(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64").toString("utf8");
}

/** Sign a payload object into a `data.sig` token with a TTL (seconds). */
function sign(payloadObj, ttlSec) {
  if (!SECRET) throw new Error("UY_SESSION_SECRET is not set");
  const payload = Object.assign({}, payloadObj, {
    exp: Math.floor(Date.now() / 1000) + (ttlSec || 0),
  });
  const data = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  return data + "." + sig;
}

/** Verify a token; returns the payload object or null. */
function verify(token) {
  if (!token || !SECRET) return null;
  const i = String(token).lastIndexOf(".");
  if (i < 0) return null;
  const data = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let obj;
  try { obj = JSON.parse(fromB64url(data)); } catch (e) { return null; }
  if (obj.exp && obj.exp < Math.floor(Date.now() / 1000)) return null;
  return obj;
}

function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}
function verifyPassword(password, saltHex, hashHex) {
  const h = hashPassword(password, saltHex);
  const a = Buffer.from(h, "hex");
  const b = Buffer.from(hashHex, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionCookie(token, maxAgeSec) {
  return [
    "uy_session=" + token,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=" + (maxAgeSec || 0),
  ].join("; ");
}
function clearCookie() {
  return "uy_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
function getSession(req) {
  const cookie = (req && req.headers && req.headers.cookie) || "";
  const m = cookie.match(/(?:^|;\s*)uy_session=([^;]+)/);
  if (!m) return null;
  return verify(decodeURIComponent(m[1]));
}

module.exports = {
  sign, verify, hashPassword, verifyPassword,
  sessionCookie, clearCookie, getSession, b64url,
};
