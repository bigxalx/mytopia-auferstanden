import { useLocalSearchParams } from 'expo-router';

import { ActorChannelScreen } from '@/src/features/channels/screens/ActorChannelScreen';
import HubFeedScreen from '@/src/features/feed/screens/HubFeedScreen';

export default function ChannelThreadRoute() {
  const params = useLocalSearchParams<{ channelId?: string | string[] }>();
  const channelId = Array.isArray(params.channelId) ? params.channelId[0] : params.channelId;

  if (channelId === 'hub') {
    return <HubFeedScreen />;
  }

  return <ActorChannelScreen channelId={channelId ?? 'hub'} />;
}
