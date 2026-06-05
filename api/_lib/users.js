"use strict";
/* Editor accounts, supplied via the UY_USERS env var as a JSON array:
   [{ "username": "racheli", "email": "racheli@example.com", "salt": "<hex>", "hash": "<hex>" }, ...]
   Generate entries with: node tools/make-user.mjs */

function getUsers() {
  try {
    const arr = JSON.parse(process.env.UY_USERS || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}
function findByUsername(u) {
  if (!u) return null;
  return getUsers().find(function (x) {
    return x.username && x.username.toLowerCase() === String(u).toLowerCase();
  }) || null;
}
function findByEmail(e) {
  if (!e) return null;
  return getUsers().find(function (x) {
    return x.email && x.email.toLowerCase() === String(e).toLowerCase();
  }) || null;
}

module.exports = { getUsers, findByUsername, findByEmail };
