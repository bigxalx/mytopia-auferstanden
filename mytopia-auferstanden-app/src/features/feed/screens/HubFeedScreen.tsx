import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { Text, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MissionChatInput } from '@/components/feed/MissionChatInput';
import { MissionChoicePicker } from '@/components/feed/MissionChoicePicker';
import { useChannels } from '@/src/features/channels/data/ChannelContext';
import { useSession } from '@/src/core/session/SessionContext';
import { useActiveMission, useActiveMissionBarVisible } from '@/src/features/tasks/context/ActiveMissionContext';
import {
  ChatThreadList,
  createDefaultScrollState,
  type ChatThreadListHandle,
} from '@/src/features/thread/components/ChatThreadList';
import { useHubThread } from '@/src/features/thread/hooks/useHubThread';
import { theme } from '@/src/shared/ui/theme';

export default function HubFeedScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { selectedMode } = useSession();
  const { getChannelScrollState, saveChannelScrollState } = useChannels();
  const { focusedMissionId, highlightMission, quizSession, registerOptimisticHandler, registerScrollHandler, setActiveChannel } =
    useActiveMission();
  const { isVisible: isMissionBarVisible, isNative: isNativeMissionBar } = useActiveMissionBarVisible();
  const threadRef = useRef<ChatThreadListHandle>(null);

  const { canLoadMore, isHydrated, isLoadingMore, items, loadMore, markRead, typingState } = useHubThread();
  const scrollState = getChannelScrollState('hub') ?? createDefaultScrollState();

  const footerInset =
    Math.max(72, insets.bottom + 108) +
    (quizSession ? 260 : focusedMissionId ? 140 : 0);
  const scrollToEndButtonBottom = isNativeMissionBar
    ? Math.max(insets.bottom + 16, 24)
    : isMissionBarVisible
      ? Math.max(insets.bottom + 92, 108)
      : Math.max(insets.bottom + 16, 24);
  const newMessagesBottom = isNativeMissionBar
    ? Math.max(insets.bottom + 16, 24)
    : isMissionBarVisible
      ? Math.max(insets.bottom + 92, 108)
      : Math.max(insets.bottom + 24, 32);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Notfallkanal',
      headerRight: () =>
        selectedMode === 'dev' ? (
          <Text style={modeBadgeStyle}>Dev Mode</Text>
        ) : null,
    });
  }, [navigation, selectedMode]);

  useFocusEffect(
    useCallback(() => {
      setActiveChannel({
        channelId: 'hub',
        channelType: 'hub',
      });

      registerOptimisticHandler(null);
      registerScrollHandler((missionIdOrTitle) => {
        const didScroll = threadRef.current?.scrollToMission(missionIdOrTitle) ?? false;
        if (didScroll && missionIdOrTitle !== 'bottom') {
          highlightMission(missionIdOrTitle);
        }
      });

      return () => {
        const nextScrollState = threadRef.current?.getScrollState() ?? createDefaultScrollState();
        saveChannelScrollState('hub', nextScrollState);
        registerOptimisticHandler(null);
        registerScrollHandler(null);
      };
    }, [highlightMission, registerOptimisticHandler, registerScrollHandler, saveChannelScrollState, setActiveChannel])
  );

  return (
    <>
      <ChatThreadList
        ref={threadRef}
        footerInset={footerInset}
        isHydrated={isHydrated}
        isLoadingMore={isLoadingMore}
        items={items}
        newMessagesBottom={newMessagesBottom}
        onEndReached={canLoadMore ? loadMore : undefined}
        onMarkRead={markRead}
        scrollState={scrollState}
        scrollToEndButtonBottom={scrollToEndButtonBottom}
        threadKey={`hub:${selectedMode}`}
        typingState={typingState}
      />
      {quizSession ? <MissionChoicePicker /> : <MissionChatInput />}
    </>
  );
}

const modeBadgeStyle: TextStyle = {
  color: theme.colors.orange,
  fontSize: 10,
  fontWeight: '800',
  paddingHorizontal: 8,
  paddingVertical: 4,
  textTransform: 'uppercase',
};
