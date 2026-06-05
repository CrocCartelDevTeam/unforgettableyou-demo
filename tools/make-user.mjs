/* Generate an editor account entry for the UY_USERS env var.
   Usage:
     node tools/make-user.mjs <username> <email> <password>
   Copy the printed object into the UY_USERS JSON array (one per editor). */
import crypto from "node:crypto";

const [, , username, email, password] = process.argv;
if (!username || !email || !password) {
  console.error("Usage: node tools/make-user.mjs <username> <email> <password>");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const hash = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32).toString("hex");

console.log(JSON.stringify({ username, email, salt, hash }));
console.error("\nAdd this object to the UY_USERS array. Example for two editors:");
console.error('UY_USERS=[' + JSON.stringify({ username, email, salt, hash }) + ', { ...second user... }]');
