#!/usr/bin/env node
/**
 * Sets or removes a custom claim on a Firebase Auth user.
 *
 * Usage:
 *   bun ./scripts/set-claim.mjs <email> <claim>          # add claim=true
 *   bun ./scripts/set-claim.mjs <email> <claim> remove   # remove claim
 *
 * Examples:
 *   bun ./scripts/set-claim.mjs armin@example.com admin
 *   bun ./scripts/set-claim.mjs armin@example.com moderator
 *   bun ./scripts/set-claim.mjs armin@example.com dev remove
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or default credentials
 * for the mytopia-6c440 project.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2];
const claim = process.argv[3];
const remove = process.argv[4] === "remove";

if (!email || !claim) {
  console.error("Usage: bun ./scripts/set-claim.mjs <email> <claim> [remove]");
  console.error("");
  console.error("Examples:");
  console.error("  bun ./scripts/set-claim.mjs user@example.com admin");
  console.error("  bun ./scripts/set-claim.mjs user@example.com moderator");
  console.error("  bun ./scripts/set-claim.mjs user@example.com dev remove");
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: "mytopia-6c440",
});

const auth = getAuth();

try {
  const user = await auth.getUserByEmail(email);
  const existing = user.customClaims ?? {};

  if (remove) {
    delete existing[claim];
    await auth.setCustomUserClaims(user.uid, existing);
    console.log(`✅ Removed "${claim}" claim from ${email} (uid: ${user.uid})`);
  } else {
    await auth.setCustomUserClaims(user.uid, { ...existing, [claim]: true });
    console.log(`✅ Set "${claim}" claim on ${email} (uid: ${user.uid})`);
  }

  // Verify
  const updated = await auth.getUser(user.uid);
  console.log("Current claims:", updated.customClaims);
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
