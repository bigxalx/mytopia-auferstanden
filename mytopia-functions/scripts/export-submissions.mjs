#!/usr/bin/env node
/**
 * Exports approved user submissions from Firestore and Firebase Storage
 * into a structured markdown document (with image previews).
 *
 * Usage:
 *   MYTOPIA_FIREBASE_PROJECT_ID=<project-id> bun ./scripts/export-submissions.mjs
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or default credentials.
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import fs from "fs";
import path from "path";

const projectId = process.env.MYTOPIA_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

if (!projectId) {
  console.error("❌ Error: Set MYTOPIA_FIREBASE_PROJECT_ID, GCLOUD_PROJECT, or GCP_PROJECT before running this script.");
  console.error("Example: MYTOPIA_FIREBASE_PROJECT_ID=mytopia-app bun ./scripts/export-submissions.mjs");
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();
const storage = getStorage();

async function run() {
  console.log(`🔍 Fetching approved submissions from Firestore collection 'v2/app/submissions' in project '${projectId}'...`);
  
  const snapshot = await db.collection("v2/app/submissions")
    .where("status", "==", "approved")
    .get();

  if (snapshot.empty) {
    console.log("⚠️ No approved submissions found.");
    return;
  }

  console.log(`✅ Found ${snapshot.size} approved submissions. Generating signed URLs for photos...`);
  
  const submissions = [];
  
  for (const doc of snapshot.docs) {
    const data = doc.data();
    let imageUrl = null;
    
    if (data.sourceType === "photo" && data.payload && data.payload.startsWith("gs://")) {
      try {
        // Parse the gs:// bucket and path
        const match = data.payload.match(/^gs:\/\/([^\/]+)\/(.+)$/);
        if (match) {
          const bucketName = match[1];
          const filePath = match[2];
          const bucket = storage.bucket(bucketName);
          const fileRef = bucket.file(filePath);
          
          // Generate a signed URL valid for 7 days
          const [url] = await fileRef.getSignedUrl({
            action: "read",
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
          });
          imageUrl = url;
        }
      } catch (err) {
        console.error(`⚠️ Failed to generate signed URL for ${data.payload}:`, err.message);
      }
    }
    
    submissions.push({
      id: doc.id,
      ...data,
      imageUrl,
    });
  }
  
  // Sort by date (newest first)
  submissions.sort((left, right) => {
    const tLeft = left.createdAt?.toMillis ? left.createdAt.toMillis() : 0;
    const tRight = right.createdAt?.toMillis ? right.createdAt.toMillis() : 0;
    return tRight - tLeft;
  });

  const outputPath = path.join(process.cwd(), "submissions-overview.md");
  let mdContent = `# User Submissions Overview\n\nGenerated on **${new Date().toLocaleString()}** for project \`${projectId}\`\n\n`;
  mdContent += `> [!NOTE]\n`;
  mdContent += `> Image links are signed for 7 days. Re-run this script to refresh expired links.\n\n`;

  // Group by mission title
  const grouped = {};
  for (const sub of submissions) {
    const title = sub.metadata?.missionTitle || sub.sourceId || "Unknown Mission";
    if (!grouped[title]) grouped[title] = [];
    grouped[title].push(sub);
  }
  
  for (const [missionTitle, subs] of Object.entries(grouped)) {
    mdContent += `## 📋 ${missionTitle} (${subs.length} submission${subs.length === 1 ? "" : "s"})\n\n`;
    for (const sub of subs) {
      const date = sub.createdAt?.toDate ? sub.createdAt.toDate().toLocaleString() : new Date().toLocaleString();
      mdContent += `### Submission: \`${sub.id}\`\n`;
      mdContent += `- **User ID**: \`${sub.ownerUid}\`\n`;
      mdContent += `- **Submitted At**: ${date}\n`;
      mdContent += `- **Points Awarded**: ${sub.earnedPoints ?? "Default"}\n`;
      if (sub.moderatorNote) {
        mdContent += `- **Moderator Note**: *"${sub.moderatorNote}"*\n`;
      }
      mdContent += `\n`;
      
      if (sub.sourceType === "photo" && sub.imageUrl) {
        mdContent += `![Submission image](${sub.imageUrl})\n\n`;
      } else if (sub.sourceType === "text") {
        mdContent += `> ${sub.payload}\n\n`;
      }
      mdContent += `---\n\n`;
    }
  }
  
  fs.writeFileSync(outputPath, mdContent);
  console.log(`🎉 Successfully saved submissions overview to: ${outputPath}`);
}

run().catch(err => {
  console.error("❌ Execution failed:", err);
  process.exit(1);
});
