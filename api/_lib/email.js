"use strict";
/* Magic-link email via Resend (https://resend.com). Set UY_RESEND_API_KEY
   and UY_EMAIL_FROM. If unset, throws — callers swallow the error so the
   API never reveals whether an address exists. */

const KEY = process.env.UY_RESEND_API_KEY || "";
const FROM = process.env.UY_EMAIL_FROM || "Unforgettable You <onboarding@resend.dev>";

async function sendMagicLink(to, link) {
  if (!KEY) throw new Error("Email not configured (UY_RESEND_API_KEY).");
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2233;line-height:1.6">' +
    "<p>Hello,</p>" +
    "<p>Click the button below to sign in and edit your website. " +
    "This link works once and expires in 30 minutes.</p>" +
    '<p style="margin:24px 0"><a href="' + link + '" ' +
    'style="background:#b08d57;color:#141b2e;padding:14px 22px;border-radius:6px;' +
    'text-decoration:none;font-weight:bold;display:inline-block">Sign in &amp; edit my site</a></p>' +
    '<p style="font-size:13px;color:#6b7280">Or paste this address into your browser:<br>' + link + "</p>" +
    "</div>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: "Your sign-in link for Unforgettable You",
      html: html,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Email send failed: " + t);
  }
  return true;
}

module.exports = { sendMagicLink };
