import { env, hasConfiguredFeedApi, hasConfiguredMissionApi } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';

const REQUEST_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MissionKind = 'quiz' | 'gps';

export type MissionListItem = {
    _id: string;
    active: boolean;
    description?: string;
    gpsConfig?: {
        latitude: number;
        longitude: number;
        radiusMeters: number;
    };
    kind: MissionKind;
    points: number;
    questionCount?: number;
    questions?: QuizQuestion[];
    title: string;
};

export type QuizQuestion = {
    options: string[];
    questionText: string;
};

export type QuizCompleteResult = {
    action: 'scored' | 'already_completed';
    correct: number;
    earned: number;
    total: number;
};

export type GpsCompleteResult = {
    action: 'scored' | 'already_completed';
    earned: number;
};

// ---------------------------------------------------------------------------
// Fetch missions (via narrativeApi /missions)
// ---------------------------------------------------------------------------

import type { AppMode } from '@/src/core/session/appMode';

export async function fetchMissions({
    mode = 'production',
}: {
    mode?: AppMode;
} = {}): Promise<MissionListItem[]> {
    if (!hasConfiguredFeedApi()) {
        throw new Error('EXPO_PUBLIC_FEED_API_BASE_URL is not configured.');
    }

    const idToken = await getIdToken();
    const baseUrl = normalizeBaseUrl(env.feedApiBaseUrl);

    const urlObj = new URL('missions', baseUrl);
    if (mode === 'dev') {
        urlObj.searchParams.set('mode', 'dev');
    }

    const response = await fetchWithTimeout(urlObj.toString(), {
        headers: { Authorization: `Bearer ${idToken}` },
        method: 'GET',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Missions fetch failed (${response.status}): ${body}`);
    }

    const payload = (await response.json()) as { missions?: unknown[] };
    return Array.isArray(payload.missions)
        ? (payload.missions as MissionListItem[])
        : [];
}

// ---------------------------------------------------------------------------
// Submit quiz completion (via missionApi /quiz/complete)
// ---------------------------------------------------------------------------

export async function submitQuizCompletion(
    missionId: string,
    answers: number[],
    mode: string = 'production'
): Promise<QuizCompleteResult> {
    if (!hasConfiguredMissionApi()) {
        throw new Error('EXPO_PUBLIC_MISSION_API_BASE_URL is not configured.');
    }

    const idToken = await getIdToken();
    const baseUrl = normalizeBaseUrl(env.missionApiBaseUrl);
    const url = `${baseUrl}quiz/complete?mode=${mode}`;

    const response = await fetchWithTimeout(url, {
        body: JSON.stringify({ answers, missionId }),
        headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
        },
        method: 'POST',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Quiz submission failed (${response.status}): ${body}`);
    }

    return (await response.json()) as QuizCompleteResult;
}

// ---------------------------------------------------------------------------
// Submit GPS completion (via missionApi /gps/complete)
// ---------------------------------------------------------------------------

export async function submitGpsCompletion(
    missionId: string,
    mode: string = 'production'
): Promise<GpsCompleteResult> {
    if (!hasConfiguredMissionApi()) {
        throw new Error('EXPO_PUBLIC_MISSION_API_BASE_URL is not configured.');
    }

    const idToken = await getIdToken();
    const baseUrl = normalizeBaseUrl(env.missionApiBaseUrl);
    const url = `${baseUrl}gps/complete?mode=${mode}`;

    const response = await fetchWithTimeout(url, {
        body: JSON.stringify({ missionId }),
        headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
        },
        method: 'POST',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`GPS submission failed (${response.status}): ${body}`);
    }

    return (await response.json()) as GpsCompleteResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getIdToken() {
    const firebaseUser = getCurrentFirebaseUser();
    if (!firebaseUser) {
        throw new Error('No authenticated Firebase user.');
    }

    return firebaseUser.getIdToken();
}

function normalizeBaseUrl(url: string) {
    return url.endsWith('/') ? url : `${url}/`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

    try {
        return await fetch(url, { ...init, signal: abortController.signal });
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            (error as { name?: unknown }).name === 'AbortError'
        ) {
            throw new Error(`Request to ${url} timed out after ${REQUEST_TIMEOUT_MS}ms.`);
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
