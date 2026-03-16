import { getIdToken } from '@react-native-firebase/auth';

import { env } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';

export async function deleteCurrentUserAccount() {
  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    throw new Error('No authenticated Firebase user available for account deletion.');
  }

  const requestUrl = resolveDeleteAccountUrl();
  const idToken = await getIdToken(firebaseUser);
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(await readDeleteError(response));
  }
}

function resolveDeleteAccountUrl() {
  const baseUrl = env.feedApiBaseUrl.length > 0
    ? env.feedApiBaseUrl
    : env.firebaseProjectId.length > 0
      ? `https://europe-west1-${env.firebaseProjectId}.cloudfunctions.net/narrativeApi/`
      : '';

  if (!baseUrl) {
    throw new Error('Delete account endpoint is not configured.');
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('account/delete', normalizedBaseUrl).toString();
}

async function readDeleteError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === 'string' && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return `Account deletion failed with ${response.status}.`;
  }

  return `Account deletion failed with ${response.status}.`;
}
