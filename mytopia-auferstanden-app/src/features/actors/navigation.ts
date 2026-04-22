export type ActorRouteParams = {
  actorAvatarUrl?: string;
  actorId: string;
  actorName?: string;
  actorRole?: string;
};

export function buildActorProfileHref({
  actorAvatarUrl,
  actorId,
  actorName,
  actorRole,
}: ActorRouteParams) {
  return {
    pathname: '/(tabs)/feed/actors/[actorId]' as const,
    params: {
      actorId,
      ...(actorAvatarUrl ? { actorAvatarUrl } : {}),
      ...(actorName ? { actorName } : {}),
      ...(actorRole ? { actorRole } : {}),
    },
  };
}

export function buildActorProfileActionsHref({
  actorAvatarUrl,
  actorId,
  actorName,
  actorRole,
}: ActorRouteParams) {
  return {
    pathname: '/(tabs)/feed/actors/[actorId]/actions' as const,
    params: {
      actorId,
      ...(actorAvatarUrl ? { actorAvatarUrl } : {}),
      ...(actorName ? { actorName } : {}),
      ...(actorRole ? { actorRole } : {}),
    },
  };
}

export function readActorRouteParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
