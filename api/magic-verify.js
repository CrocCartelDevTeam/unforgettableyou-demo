"use strict";
const { verify, sign, sessionCookie } = require("./_lib/auth");

const SESSION_TTL = 60 * 60 * 12; // 12 hours

module.exports = function (req, res) {
  const token = (req.query && req.query.token) || "";
  const data = verify(token);
  if (!data || !data.m) {
    res.status(401).send("This sign-in link is invalid or has expired. Please request a new one.");
    return;
  }
  const session = sign({ u: data.u }, SESSION_TTL);
  res.setHeader("Set-Cookie", sessionCookie(session, SESSION_TTL));
  res.setHeader("Location", "/?signedin=1");
  res.status(302).end();
};
