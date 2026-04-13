import { getIdToken } from '@react-native-firebase/auth';
import { env, hasConfiguredFeedApi, hasConfiguredMissionApi } from '@/src/config/env';
import { getCurrentFirebaseUser } from '@/src/core/firebase/authClient';
import type { AppMode } from '@/src/core/session/appMode';

const REQUEST_TIMEOUT_MS = 15000;
const MISSION_CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MissionKind = 'quiz' | 'gps' | 'text' | 'photo';

export const MISSION_KIND_METADATA: Record<MissionKind, { emoji: string; label: string }> = {
    quiz: { emoji: '🧠', label: 'Quiz' },
    gps: { emoji: '📍', label: 'GPS' },
    text: { emoji: '📝', label: 'Text' },
    photo: { emoji: '📸', label: 'Foto' },
};

export type MissionListItem = {
    _id: string;
    active: boolean;
    description?: string;
    expiresAt?: string;
    gpsConfig?: {
        latitude: number;
        longitude: number;
        radiusMeters: number;
    };
    groupId?: string;
    groupTitle?: string;
    imageUrl?: string;
    kind: MissionKind;
    points: number;
    questionCount?: number;
    questions?: QuizQuestion[];
    title: string;
    feedbackCorrect?: string;
    feedbackIncorrect?: string;
};

type MissionCacheEntry = {
    fetchedAt: number;
    missions: MissionListItem[];
};

const missionCache = new Map<AppMode, MissionCacheEntry>();
const inFlightMissionRequests = new Map<AppMode, Promise<MissionListItem[]>>();

export type QuizQuestion = {
    options: { text: string; isCorrect: boolean }[];
    questionText: string;
    feedbackCorrect?: string;
    feedbackIncorrect?: string;
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

export type SubmitResult = {
    action: 'submitted' | 'already_submitted';
};

// ---------------------------------------------------------------------------
// Fetch missions (via narrativeApi /missions)
// ---------------------------------------------------------------------------

export async function fetchMissions({
    mode = 'production',
    forceRefresh = false,
}: {
    forceRefresh?: boolean;
    mode?: AppMode;
} = {}): Promise<MissionListItem[]> {
    if (!hasConfiguredFeedApi()) {
        throw new Error('EXPO_PUBLIC_FEED_API_BASE_URL is not configured.');
    }

    const cached = missionCache.get(mode);
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < MISSION_CACHE_TTL_MS) {
        return cached.missions;
    }

    const existingRequest = inFlightMissionRequests.get(mode);
    if (!forceRefresh && existingRequest) {
        return existingRequest;
    }

    const request = loadMissionsFromApi(mode);
    inFlightMissionRequests.set(mode, request);

    try {
        return await request;
    } finally {
        if (inFlightMissionRequests.get(mode) === request) {
            inFlightMissionRequests.delete(mode);
        }
    }
}

export function getCachedMissions(mode: AppMode = 'production'): MissionListItem[] | null {
    return missionCache.get(mode)?.missions ?? null;
}

async function loadMissionsFromApi(mode: AppMode): Promise<MissionListItem[]> {
    const idToken = await ensureIdToken();
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
    const missions = Array.isArray(payload.missions)
        ? (payload.missions as MissionListItem[])
        : [];

    missionCache.set(mode, {
        fetchedAt: Date.now(),
        missions,
    });

    return missions;
}

export async function fetchSettings(mode: AppMode = 'production'): Promise<any> {
    if (!hasConfiguredMissionApi()) {
        throw new Error('EXPO_PUBLIC_MISSION_API_BASE_URL is not configured.');
    }

    // Global settings are public, so we only attach a token if a user is actually logged in.
    const firebaseUser = getCurrentFirebaseUser();
    const idToken = firebaseUser ? await getIdToken(firebaseUser) : null;

    const baseUrl = normalizeBaseUrl(env.missionApiBaseUrl);
    const url = `${baseUrl}settings?mode=${mode}`;

    const headers: Record<string, string> = {};
    if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetchWithTimeout(url, {
        headers,
        method: 'GET',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Settings fetch failed (${response.status}): ${body}`);
    }

    return (await response.json());
}

// ---------------------------------------------------------------------------
// Submit quiz completion (via missionApi /quiz/complete)
// ---------------------------------------------------------------------------

export async function submitQuizCompletion(
    missionId: string,
    answers: number[],
    mode: AppMode = 'production'
): Promise<QuizCompleteResult> {
    if (!hasConfiguredMissionApi()) {
        throw new Error('EXPO_PUBLIC_MISSION_API_BASE_URL is not configured.');
    }

    const idToken = await ensureIdToken();
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
    mode: AppMode = 'production'
): Promise<GpsCompleteResult> {
    if (!hasConfiguredMissionApi()) {
        throw new Error('EXPO_PUBLIC_MISSION_API_BASE_URL is not configured.');
    }

    const idToken = await ensureIdToken();
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
// Submit text mission (via missionApi /text/submit)
// ---------------------------------------------------------------------------

export async function submitTextMission(
    missionId: string,
    text: string,
    mode: AppMode = 'production'
): Promise<SubmitResult> {
    if (!hasConfiguredMissionApi()) {
        throw new Error('EXPO_PUBLIC_MISSION_API_BASE_URL is not configured.');
    }

    const idToken = await ensureIdToken();
    const baseUrl = normalizeBaseUrl(env.missionApiBaseUrl);
    const url = `${baseUrl}text/submit?mode=${mode}`;

    const response = await fetchWithTimeout(url, {
        body: JSON.stringify({ missionId, text }),
        headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
        },
        method: 'POST',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Text submission failed (${response.status}): ${body}`);
    }

    return (await response.json()) as SubmitResult;
}

// ---------------------------------------------------------------------------
// Submit photo mission (via missionApi /photo/submit)
// ---------------------------------------------------------------------------

export async function submitPhotoMission(
    missionId: string,
    photoPath: string,
    mode: AppMode = 'production'
): Promise<SubmitResult> {
    if (!hasConfiguredMissionApi()) {
        throw new Error('EXPO_PUBLIC_MISSION_API_BASE_URL is not configured.');
    }

    const idToken = await ensureIdToken();
    const baseUrl = normalizeBaseUrl(env.missionApiBaseUrl);
    const url = `${baseUrl}photo/submit?mode=${mode}`;

    const response = await fetchWithTimeout(url, {
        body: JSON.stringify({ missionId, photoPath }),
        headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
        },
        method: 'POST',
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Photo submission failed (${response.status}): ${body}`);
    }

    return (await response.json()) as SubmitResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureIdToken() {
    const firebaseUser = getCurrentFirebaseUser();
    if (!firebaseUser) {
        throw new Error('No authenticated Firebase user.');
    }

    return getIdToken(firebaseUser);
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
