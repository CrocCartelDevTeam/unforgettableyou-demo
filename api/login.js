"use strict";
const { findByUsername } = require("./_lib/users");
const { verifyPassword, sign, sessionCookie } = require("./_lib/auth");

const SESSION_TTL = 60 * 60 * 12; // 12 hours

module.exports = function (req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const body = req.body || {};
  const username = body.username;
  const password = body.password;
  if (!username || !password) { res.status(400).json({ error: "Please enter your username and password." }); return; }

  const user = findByUsername(username);
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  const token = sign({ u: user.username }, SESSION_TTL);
  res.setHeader("Set-Cookie", sessionCookie(token, SESSION_TTL));
  res.status(200).json({ ok: true, user: user.username });
};
