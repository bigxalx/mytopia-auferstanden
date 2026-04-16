import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import ImageView from 'react-native-image-viewing';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
} from 'react-native';

import {
  FeedDownArrowIcon,
  ThreadFeedItemRow,
} from '@/src/features/thread/components/ThreadRows';
import { threadListStyles as styles } from '@/src/features/thread/components/threadListStyles';
import {
  buildThreadFeedItems,
  type FeedItem,
} from '@/src/features/thread/data/threadRenderItems';
import { useThreadViewportState } from '@/src/features/thread/hooks/useThreadViewportState';
import { type ChannelScrollState } from '@/src/features/channels/data/ChannelContext';
import { type PlaybackMessage } from '@/src/features/feed/utils/playback';
import { type ThreadTypingState } from '@/src/features/thread/data/threadMessages';
import { theme } from '@/src/shared/ui/theme';

const SCROLL_TO_END_ICON_VARIANT: 'outline' | 'bold' = 'outline';
export type ChatThreadListHandle = {
  getScrollState: () => ChannelScrollState;
  scrollToBottom: (options?: { animated?: boolean }) => void;
  scrollToMessageKey: (messageKey: string) => boolean;
  scrollToMission: (missionIdOrTitle: string) => boolean;
};

export function createDefaultScrollState(): ChannelScrollState {
  return {
    offsetY: 0,
    wasAtBottom: true,
  };
}

export const ChatThreadList = forwardRef<ChatThreadListHandle, ChatThreadListProps>(
  function ChatThreadList(
    {
      animatedResultKey,
      deferUntilReady = false,
      emptyState,
      footerInset,
      highlightedMessageKey,
      hero,
      isHydrated,
      isLoadingMore = false,
      items,
      loadingState,
      newMessagesBottom,
      onEndReached,
      onMarkRead,
      scrollState,
      scrollToEndButtonBottom,
      threadKey,
      typingState,
    },
    ref
  ) {
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

    const imageSources = useMemo(
      () =>
        items
          .filter((message) => message.message.attachment?._type === 'imageAttachment')
          .map((message) => ({
            uri: (
              message.message.attachment as Extract<
                PlaybackMessage['message']['attachment'],
                { _type: 'imageAttachment' }
              >
            ).url,
          })),
      [items]
    );

    const baseFeedItems = useMemo(
      () => buildThreadFeedItems(items),
      [items]
    );

    const {
      clearNewMessagesBadge,
      didCaptureInitialItemsRef,
      getScrollState,
      handleContentSizeChange,
      handleLayout,
      handleScroll,
      initialContentOffset,
      isReady,
      listRef,
      maintainVisibleContentPosition,
      newMessagesOpacity,
      scrollToBottom,
      scrollToMessageKey,
      scrollToEndOpacity,
      scrollToMission,
      seenMessageKeysRef,
      showNewMessagesBadge,
      showScrollToEndButton,
    } = useThreadViewportState({
      deferUntilReady,
      feedItems: baseFeedItems,
      isHydrated,
      items,
      onMarkRead,
      scrollState,
      threadKey,
    });

    const renderFeedItems = useMemo(
      () => buildThreadFeedItems(items, isReady ? typingState : null),
      [isReady, items, typingState]
    );

    useImperativeHandle(
      ref,
      () => ({
        getScrollState,
        scrollToBottom,
        scrollToMessageKey,
        scrollToMission,
      }),
      [getScrollState, scrollToBottom, scrollToMessageKey, scrollToMission]
    );

    const handleImagePress = useCallback((imageIndex: number) => {
      setViewerIndex(imageIndex);
      setViewerVisible(true);
    }, []);

    const renderItem = useCallback(
      ({ index, item }: ListRenderItemInfo<FeedItem>) => (
        <ThreadFeedItemRow
          allowAnimations={isReady}
          animatedResultKey={animatedResultKey}
          didCaptureInitialItemsRef={didCaptureInitialItemsRef}
          feedItems={renderFeedItems}
          highlightedMessageKey={highlightedMessageKey}
          imageSources={imageSources}
          index={index}
          item={item}
          onImagePress={handleImagePress}
          seenMessageKeysRef={seenMessageKeysRef}
        />
      ),
      [
        isReady,
        animatedResultKey,
        didCaptureInitialItemsRef,
        renderFeedItems,
        handleImagePress,
        highlightedMessageKey,
        imageSources,
        seenMessageKeysRef,
      ]
    );

    const listFooter = useMemo(
      () => (
        <View style={{ height: footerInset }}>
          {isLoadingMore ? (
            <View style={styles.loadingMoreWrap}>
              <ActivityIndicator color={theme.colors.orange} size="small" />
            </View>
          ) : null}
        </View>
      ),
      [footerInset, isLoadingMore]
    );

    return (
      <>
        <FlashList
          ref={listRef}
          contentOffset={initialContentOffset}
          contentContainerStyle={[
            styles.scrollContent,
            !isReady && styles.scrollContentHidden,
          ]}
          keyboardDismissMode="interactive"
          data={renderFeedItems}
          getItemType={(item) => {
            if (item.type !== 'message') {
              return item.type;
            }

            const attachmentType = item.data.message.attachment?._type;
            if (attachmentType === 'missionResultAttachment') {
              return 'message:result';
            }
            if (attachmentType === 'systemAttachment') {
              return 'message:system';
            }
            if (attachmentType) {
              return `message:${attachmentType}`;
            }
            return item.data.message.isUser ? 'message:user' : 'message:npc';
          }}
          keyExtractor={(item) => item.key}
          ListEmptyComponent={
            !isHydrated
              ? (loadingState ?? (
                  <View style={styles.stateBox}>
                    <ActivityIndicator color={theme.colors.orange} size="large" />
                    <Text style={styles.stateText}>Feed wird geladen...</Text>
                  </View>
                ))
              : (emptyState ?? (
                  <View style={styles.stateBox}>
                    <Text style={styles.stateText}>Noch keine Nachrichten verfügbar.</Text>
                  </View>
                ))
          }
          ListFooterComponent={listFooter}
          ListHeaderComponent={hero}
          maintainVisibleContentPosition={maintainVisibleContentPosition}
          onContentSizeChange={handleContentSizeChange}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onLayout={handleLayout}
          onScroll={handleScroll}
          renderItem={renderItem}
          scrollEventThrottle={16}
          style={styles.scrollView}
        />

        {!isReady ? (
          <View pointerEvents="none" style={styles.readyOverlay}>
            {loadingState ?? (
              <View style={styles.stateBox}>
                <ActivityIndicator color={theme.colors.orange} size="large" />
                <Text style={styles.stateText}>Feed wird geladen...</Text>
              </View>
            )}
          </View>
        ) : null}

        <Animated.View
          pointerEvents={showNewMessagesBadge ? 'auto' : 'none'}
          style={[
            styles.newMessagesContainer,
            { bottom: newMessagesBottom, opacity: newMessagesOpacity },
          ]}
        >
          <Pressable
            onPress={() => {
              scrollToBottom();
              clearNewMessagesBadge();
            }}
            style={styles.newMessagesButton}
          >
            <FeedDownArrowIcon color="white" size={18} variant="bold" />
            <Text style={styles.newMessagesText}>Neue Nachrichten</Text>
          </Pressable>
        </Animated.View>

        <Animated.View
          pointerEvents={showScrollToEndButton ? 'box-none' : 'none'}
          style={[
            styles.scrollToEndButtonWrap,
            { bottom: scrollToEndButtonBottom, opacity: scrollToEndOpacity },
          ]}
        >
          <Pressable
            accessibilityLabel="Zum Ende scrollen"
            onPress={() => scrollToBottom()}
            style={({ pressed }) => [styles.scrollToEndPressable, pressed && styles.scrollToEndPressed]}
          >
            <View style={[styles.scrollToEndButton, styles.scrollToEndButtonFallback]}>
              <FeedDownArrowIcon
                color={theme.colors.cardTextHeading}
                size={22}
                variant={SCROLL_TO_END_ICON_VARIANT}
              />
            </View>
          </Pressable>
        </Animated.View>

        <ImageView
          imageIndex={viewerIndex}
          images={imageSources}
          onRequestClose={() => setViewerVisible(false)}
          visible={viewerVisible}
        />
      </>
    );
  }
);

type ChatThreadListProps = {
  animatedResultKey?: string | null;
  deferUntilReady?: boolean;
  emptyState?: React.ReactElement | null;
  footerInset: number;
  highlightedMessageKey?: string | null;
  hero?: React.ReactElement | null;
  isHydrated: boolean;
  isLoadingMore?: boolean;
  items: PlaybackMessage[];
  loadingState?: React.ReactElement | null;
  newMessagesBottom: number;
  onEndReached?: () => void;
  onMarkRead?: () => void | Promise<void>;
  scrollState: ChannelScrollState;
  scrollToEndButtonBottom: number;
  threadKey: string;
  typingState?: ThreadTypingState | null;
};
