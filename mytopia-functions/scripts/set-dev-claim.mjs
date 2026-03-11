#!/usr/bin/env node
/**
 * Sets the "dev" custom claim on a Firebase Auth user.
 *
 * Usage:
 *   bun ./scripts/set-dev-claim.mjs user@example.com        # add dev claim
 *   bun ./scripts/set-dev-claim.mjs user@example.com remove  # remove dev claim
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or default credentials
 * for the mytopia-6c440 project.
 */

import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2];
const remove = process.argv[3] === "remove";

if (!email) {
  console.error("Usage: bun ./scripts/set-dev-claim.mjs <email> [remove]");
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
    delete existing.dev;
    await auth.setCustomUserClaims(user.uid, existing);
    console.log(`✅ Removed "dev" claim from ${email} (uid: ${user.uid})`);
  } else {
    await auth.setCustomUserClaims(user.uid, { ...existing, dev: true });
    console.log(`✅ Set "dev" claim on ${email} (uid: ${user.uid})`);
  }

  // Verify
  const updated = await auth.getUser(user.uid);
  console.log("Current claims:", updated.customClaims);
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
