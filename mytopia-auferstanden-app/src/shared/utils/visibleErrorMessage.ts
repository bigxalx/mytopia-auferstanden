const DEFAULT_VISIBLE_ERROR_MESSAGE = 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';

const KNOWN_ERROR_MESSAGES: { pattern: RegExp; message: string }[] = [
  {
    pattern: /auth\/invalid-credential|auth\/invalid-login-credentials|email or password|wrong-password/i,
    message: 'E-Mail oder Passwort ist nicht korrekt.',
  },
  {
    pattern: /auth\/email-already-in-use|already exists|already in use/i,
    message: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
  },
  {
    pattern: /auth\/invalid-email|valid email/i,
    message: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  },
  {
    pattern: /auth\/weak-password|password must|weak password/i,
    message: 'Das Passwort muss mindestens 6 Zeichen lang sein.',
  },
  {
    pattern: /auth\/too-many-requests|too many attempts|too many requests/i,
    message: 'Zu viele Versuche. Bitte probiere es später erneut.',
  },
  {
    pattern: /auth\/user-not-found|no account found/i,
    message: 'Für diese E-Mail-Adresse wurde kein Konto gefunden.',
  },
  {
    pattern: /network|offline|internet/i,
    message: 'Netzwerkfehler. Bitte prüfe deine Verbindung und versuche es erneut.',
  },
  {
    pattern: /timed out|timeout/i,
    message: 'Die Anfrage hat zu lange gedauert. Bitte versuche es erneut.',
  },
  {
    pattern: /not configured|no default app|EXPO_PUBLIC_|Firebase is not configured/i,
    message: 'Die App ist in diesem Build nicht vollständig konfiguriert.',
  },
  {
    pattern: /No authenticated Firebase user|Missing bearer token|Invalid Firebase ID token|signed-in user/i,
    message: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  },
  {
    pattern: /account deletion|delete account/i,
    message: 'Konto konnte nicht gelöscht werden.',
  },
  {
    pattern: /Missions fetch failed|Failed to load missions/i,
    message: 'Missionen konnten nicht geladen werden.',
  },
  {
    pattern: /Failed to load mission|Mission not found|Route not found/i,
    message: 'Mission konnte nicht geladen werden.',
  },
  {
    pattern: /Settings fetch failed/i,
    message: 'Einstellungen konnten nicht geladen werden.',
  },
  {
    pattern: /Actor profile|actor profile|Actor not found/i,
    message: 'Profil konnte nicht geladen werden.',
  },
  {
    pattern: /Feed API request/i,
    message: 'Nachrichten konnten nicht geladen werden.',
  },
  {
    pattern: /Reaction request/i,
    message: 'Reaktion konnte nicht gesendet werden.',
  },
  {
    pattern: /Map points fetch/i,
    message: 'Karte konnte nicht geladen werden.',
  },
  {
    pattern: /Quiz submission|Submission failed/i,
    message: 'Einreichung konnte nicht gesendet werden.',
  },
  {
    pattern: /GPS submission|Check-in failed/i,
    message: 'Einchecken fehlgeschlagen.',
  },
  {
    pattern: /Text submission|Submit failed/i,
    message: 'Beitrag konnte nicht gesendet werden.',
  },
  {
    pattern: /Photo submission|upload/i,
    message: 'Foto konnte nicht gesendet werden.',
  },
  {
    pattern: /Directions URL/i,
    message: 'Wegbeschreibung wird auf diesem Gerät nicht unterstützt.',
  },
  {
    pattern: /Something went wrong|unknown error|request failed|failed/i,
    message: DEFAULT_VISIBLE_ERROR_MESSAGE,
  },
];

export function getVisibleErrorMessage(error: unknown, fallback = DEFAULT_VISIBLE_ERROR_MESSAGE) {
  const rawMessage = extractErrorMessage(error);
  if (!rawMessage) {
    return fallback;
  }

  const mappedMessage = mapKnownErrorMessage(rawMessage);
  if (mappedMessage) {
    return mappedMessage;
  }

  if (isLikelyGermanUserMessage(rawMessage)) {
    return ensureSentence(rawMessage);
  }

  return fallback;
}

function extractErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') {
    const message = extractJsonErrorMessage(error) ?? error.trim();
    return message || null;
  }

  if (error instanceof Error) {
    const message = extractJsonErrorMessage(error.message) ?? error.message.trim();
    return message || null;
  }

  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const candidate = error as { error?: unknown; errorMessage?: unknown; message?: unknown };
    const fields = [candidate.errorMessage, candidate.error, candidate.message];

    for (const field of fields) {
      if (typeof field === 'string' && field.trim().length > 0) {
        return extractJsonErrorMessage(field) ?? field.trim();
      }
    }
  }

  return null;
}

function extractJsonErrorMessage(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string' && parsed.error.trim().length > 0) {
      return parsed.error.trim();
    }
    if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }
  } catch {
    return null;
  }

  return null;
}

function mapKnownErrorMessage(message: string) {
  for (const entry of KNOWN_ERROR_MESSAGES) {
    if (entry.pattern.test(message)) {
      return entry.message;
    }
  }

  return null;
}

function isLikelyGermanUserMessage(message: string) {
  return /[äöüÄÖÜß]/.test(message) ||
    /\b(Bitte|Konto|Passwort|Profil|Foto|Beitrag|Einreichung|Einchecken|Wegbeschreibung|Standort|Netzwerkfehler|Fehler|konnte|gelöscht|geladen|gesendet|erneut|gültig|Sitzung|Anfrage|Zeitüberschreitung|Übertragung|verfügbar|bestätige)\b/i.test(message);
}

function ensureSentence(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return DEFAULT_VISIBLE_ERROR_MESSAGE;
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
