import { getIdToken } from '@react-native-firebase/auth';

import { env, hasConfiguredFeedApi } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import type { AppMode } from '@/src/core/session/appMode';
import type { NarrativeReactionId } from '@/src/features/feed/reactions/reactionCatalog';

const REQUEST_TIMEOUT_MS = 15000;

export async function submitNarrativeReaction({
  bundleId,
  messageId,
  mode = 'production',
  reaction,
}: {
  bundleId: string;
  messageId: string;
  mode?: AppMode;
  reaction: NarrativeReactionId | null;
}) {
  if (!hasConfiguredFeedApi()) {
    throw new Error('EXPO_PUBLIC_FEED_API_BASE_URL is not configured.');
  }

  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    throw new Error('No authenticated Firebase user available for reaction request.');
  }

  const idToken = await getIdToken(firebaseUser);
  const baseUrl = env.feedApiBaseUrl.endsWith('/') ? env.feedApiBaseUrl : `${env.feedApiBaseUrl}/`;
  const url = new URL('feed/reactions', baseUrl);
  if (mode === 'dev') {
    url.searchParams.set('mode', 'dev');
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      body: JSON.stringify({
        bundleId,
        messageId,
        reaction,
      }),
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: abortController.signal,
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') {
      throw new Error(`Reaction request timed out after ${REQUEST_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Reaction request failed with ${response.status}: ${body}`);
  }
}
