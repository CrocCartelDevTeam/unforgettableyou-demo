"use strict";
const { getSession } = require("./_lib/auth");

module.exports = function (req, res) {
  const s = getSession(req);
  if (!s) { res.status(401).json({ authenticated: false }); return; }
  res.status(200).json({ authenticated: true, user: s.u });
};
