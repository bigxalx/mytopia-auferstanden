import { getIdToken } from '@react-native-firebase/auth';

import { env } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import { getVisibleErrorMessage } from '@/src/shared/utils/visibleErrorMessage';

export async function deleteCurrentUserAccount() {
  const firebaseUser = getCurrentFirebaseUser();
  if (!firebaseUser) {
    throw new Error('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
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
    throw new Error('Die Kontolöschung ist in diesem Build nicht konfiguriert.');
  }

  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('account/delete', normalizedBaseUrl).toString();
}

async function readDeleteError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return getVisibleErrorMessage(payload, `Konto konnte nicht gelöscht werden (${response.status}).`);
  } catch {
    return `Konto konnte nicht gelöscht werden (${response.status}).`;
  }
}
