const baseUrl = process.env.EXPO_PUBLIC_FEED_API_BASE_URL;

if (!baseUrl || baseUrl.trim().length === 0) {
  console.error('Missing EXPO_PUBLIC_FEED_API_BASE_URL in environment.');
  process.exit(1);
}

const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
const requestUrl = new URL('feed?limit=1', normalizedBase).toString();

console.log(`[feed-probe] URL: ${requestUrl}`);

try {
  const response = await fetch(requestUrl, {
    method: 'GET',
  });
  const body = await response.text();

  console.log(`[feed-probe] HTTP ${response.status}`);

  if (response.status === 401) {
    console.log('[feed-probe] Reachability OK: endpoint is live and correctly requires auth.');
    process.exit(0);
  }

  if (response.ok) {
    console.log('[feed-probe] Endpoint responded with success (unexpected without auth, but reachable).');
    process.exit(0);
  }

  console.error(`[feed-probe] Endpoint reachable but returned unexpected status ${response.status}.`);
  if (body.trim().length > 0) {
    console.error(`[feed-probe] Body: ${body}`);
  }
  process.exit(1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[feed-probe] Request failed: ${message}`);
  process.exit(1);
}
