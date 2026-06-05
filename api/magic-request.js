"use strict";
const { findByEmail } = require("./_lib/users");
const { sign } = require("./_lib/auth");
const { sendMagicLink } = require("./_lib/email");

module.exports = async function (req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  const email = (req.body && req.body.email) || "";

  // Always respond ok — never reveal which emails are registered.
  try {
    const user = findByEmail(email);
    if (user) {
      const token = sign({ u: user.username, m: 1 }, 30 * 60); // 30 min, magic flag
      const base = (process.env.UY_SITE_URL || ("https://" + (req.headers.host || ""))).replace(/\/$/, "");
      const link = base + "/api/magic-verify?token=" + encodeURIComponent(token);
      await sendMagicLink(user.email, link);
    }
  } catch (e) {
    console.error("magic-request:", e && e.message);
  }
  res.status(200).json({ ok: true });
};
