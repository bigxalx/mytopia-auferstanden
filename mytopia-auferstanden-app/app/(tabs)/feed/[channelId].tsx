import { Redirect, useLocalSearchParams } from 'expo-router';

import { ActorChannelScreen } from '@/src/features/channels/screens/ActorChannelScreen';

export default function ChannelThreadRoute() {
  const params = useLocalSearchParams<{ channelId?: string | string[] }>();
  const channelId = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId;

  if (!channelId || channelId === 'hub') {
    return <Redirect href="/(tabs)/feed/hub" />;
  }

  return <ActorChannelScreen channelId={channelId} />;
}
