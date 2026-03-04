import { encodeSignatureHeader, SIGNATURE_HEADER_NAME } from '@sanity/webhook';

const secret = process.env.SANITY_WEBHOOK_SECRET;
const releaseUrl = process.env.RELEASE_FUNCTION_URL;

if (!secret || secret.trim().length === 0) {
  console.error('[webhook-probe] Missing SANITY_WEBHOOK_SECRET.');
  process.exit(1);
}

if (!releaseUrl || releaseUrl.trim().length === 0) {
  console.error('[webhook-probe] Missing RELEASE_FUNCTION_URL.');
  process.exit(1);
}

const webhookUrl = releaseUrl
  .replace(/\/internal\/release-bundle\/?$/, '/sanity/webhook/bundle-upsert')
  .trim();

const payload = JSON.stringify({
  _id: 'webhook-signature-probe',
});

const signature = await encodeSignatureHeader(payload, Date.now(), secret);

console.log(`[webhook-probe] URL: ${webhookUrl}`);
console.log(`[webhook-probe] Header: ${SIGNATURE_HEADER_NAME}`);

const response = await fetch(webhookUrl, {
  body: payload,
  headers: {
    'content-type': 'application/json',
    [SIGNATURE_HEADER_NAME]: signature,
  },
  method: 'POST',
});

const bodyText = await response.text();
console.log(`[webhook-probe] HTTP ${response.status}`);
console.log(`[webhook-probe] Body: ${bodyText}`);

if (response.status === 200) {
  console.log('[webhook-probe] Signature accepted by function runtime.');
  process.exit(0);
}

if (response.status === 401) {
  console.error('[webhook-probe] Signature rejected. Verify SANITY_WEBHOOK_SECRET and redeploy.');
  process.exit(1);
}

console.error('[webhook-probe] Unexpected status. Endpoint reachable, but check function logs.');
process.exit(1);
