import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  Animated,
  Easing,
  InteractionManager,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/feed/MessageBubble';
import { NarrativeReactionPicker } from '@/components/feed/NarrativeReactionPicker';
import type {
  ThreadReactionFrame,
  ThreadReactionTarget,
} from '@/src/features/thread/data/threadReactionTarget';
import {
  getEmptyNarrativeReactionState,
  resolveNarrativeReactionSelection,
  type NarrativeMessageReactionState,
  type NarrativeReactionId,
} from '@/src/features/feed/reactions/reactionCatalog';
import { theme } from '@/src/shared/ui/theme';

const CLOSE_BACKDROP_DURATION_MS = 180;
const CLOSE_MESSAGE_DURATION_MS = 220;
const CLOSE_PICKER_DURATION_MS = 120;
const OPEN_BACKDROP_DURATION_MS = 180;
const OPEN_MESSAGE_DURATION_MS = 260;
const OPEN_PICKER_DELAY_MS = 110;
const OPEN_PICKER_DURATION_MS = 180;

export function NarrativeReactionOverlay({
  onClose,
  onCommitSelection,
  reactionState,
  target,
  visible,
}: {
  onClose: () => void;
  onCommitSelection: (reaction: NarrativeReactionId | null) => void;
  reactionState: NarrativeMessageReactionState | null;
  target: ThreadReactionTarget | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const messageCardRef = useRef<View>(null);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const messageProgress = useRef(new Animated.Value(0)).current;
  const pickerOpacity = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const [displayReactionState, setDisplayReactionState] =
    useState<NarrativeMessageReactionState | null>(reactionState);
  const [pickerSelectedReaction, setPickerSelectedReaction] = useState<NarrativeReactionId | null>(
    reactionState?.viewerReaction ?? null
  );
  const [isClosing, setIsClosing] = useState(false);
  const [targetFrame, setTargetFrame] = useState<ThreadReactionFrame | null>(null);
  const shouldAnimateEntry = Boolean(target?.sourceFrame && targetFrame);
  const maxMessageWidth = Math.max(windowWidth - 48, 0);
  const overlayMessageWidth = target?.sourceFrame
    ? Math.min(target.sourceFrame.width, maxMessageWidth)
    : maxMessageWidth;

  const measureTargetFrame = useCallback(() => {
    if (isClosingRef.current || targetFrame) {
      return;
    }

    requestAnimationFrame(() => {
      messageCardRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          setTargetFrame({
            height,
            width,
            x,
            y,
          });
        }
      });
    });
  }, [targetFrame]);

  useEffect(() => {
    if (!visible || !target) {
      setTargetFrame(null);
      isClosingRef.current = false;
      setIsClosing(false);
      setDisplayReactionState(reactionState);
      setPickerSelectedReaction(reactionState?.viewerReaction ?? null);
      return;
    }

    setTargetFrame(null);
    isClosingRef.current = false;
    setIsClosing(false);
    setDisplayReactionState(reactionState);
    setPickerSelectedReaction(reactionState?.viewerReaction ?? null);
    backdropOpacity.stopAnimation();
    messageProgress.stopAnimation();
    pickerOpacity.stopAnimation();

    if (target.sourceFrame) {
      backdropOpacity.setValue(0);
      messageProgress.setValue(0);
      pickerOpacity.setValue(0);
    } else {
      backdropOpacity.setValue(1);
      messageProgress.setValue(1);
      pickerOpacity.setValue(1);
    }
  }, [backdropOpacity, messageProgress, pickerOpacity, reactionState, target, visible]);

  useEffect(() => {
    if (!visible || !target || !targetFrame) {
      return;
    }

    if (!target.sourceFrame) {
      backdropOpacity.setValue(1);
      messageProgress.setValue(1);
      pickerOpacity.setValue(1);
      return;
    }

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: OPEN_BACKDROP_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(messageProgress, {
        duration: OPEN_MESSAGE_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(pickerOpacity, {
        delay: OPEN_PICKER_DELAY_MS,
        duration: OPEN_PICKER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, messageProgress, pickerOpacity, target, targetFrame, visible]);

  useEffect(() => {
    if (!visible || isClosingRef.current) {
      return;
    }

    setDisplayReactionState(reactionState);
    setPickerSelectedReaction(reactionState?.viewerReaction ?? null);
  }, [reactionState, visible]);

  const messageReactionState = displayReactionState ?? reactionState ?? getEmptyNarrativeReactionState();
  const animatedMessageStyle = shouldAnimateEntry
    ? buildAnimatedMessageStyle({
        progress: messageProgress,
        sourceFrame: target?.sourceFrame as ThreadReactionFrame,
        targetFrame: targetFrame as ThreadReactionFrame,
      })
    : { opacity: 1 };

  const animatedPickerStyle = {
    opacity: pickerOpacity,
    transform: [
      {
        translateY: pickerOpacity.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };

  const runCloseAnimation = useCallback((onAfterClose?: () => void) => {
    if (isClosingRef.current) {
      return;
    }

    if (!target?.sourceFrame || !targetFrame) {
      onClose();
      if (onAfterClose) {
        InteractionManager.runAfterInteractions(onAfterClose);
      }
      return;
    }

    isClosingRef.current = true;
    setIsClosing(true);
    backdropOpacity.stopAnimation();
    messageProgress.stopAnimation();
    pickerOpacity.stopAnimation();

    Animated.parallel([
      Animated.timing(pickerOpacity, {
        duration: CLOSE_PICKER_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        duration: CLOSE_BACKDROP_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(messageProgress, {
        duration: CLOSE_MESSAGE_DURATION_MS,
        easing: Easing.inOut(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isClosingRef.current = false;
      setIsClosing(false);
      onClose();
      if (onAfterClose) {
        InteractionManager.runAfterInteractions(onAfterClose);
      }
    });
  }, [backdropOpacity, messageProgress, onClose, pickerOpacity, target?.sourceFrame, targetFrame]);

  const requestClose = useCallback(() => {
    runCloseAnimation();
  }, [runCloseAnimation]);

  const handleSelect = useCallback((selectedReaction: NarrativeReactionId) => {
    const currentState = messageReactionState;
    const nextReaction = resolveNarrativeReactionSelection(
      pickerSelectedReaction ?? currentState.viewerReaction,
      selectedReaction
    );

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerSelectedReaction(nextReaction);
    runCloseAnimation(() => {
      onCommitSelection(nextReaction);
    });
  }, [messageReactionState, onCommitSelection, pickerSelectedReaction, runCloseAnimation]);

  if (!visible || !target) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={requestClose}
      transparent
      visible={visible}
    >
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[styles.overlay, { opacity: backdropOpacity }]}>
          <BlurView intensity={34} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.overlayTint} />
        </Animated.View>
        <Pressable onPress={requestClose} style={StyleSheet.absoluteFill} />
        <View
          pointerEvents="box-none"
          style={[
            styles.content,
            {
              paddingBottom: Math.max(insets.bottom + 20, 28),
              paddingTop: Math.max(insets.top + 20, 28),
            },
          ]}
        >
          <View onStartShouldSetResponder={() => true} style={styles.focusedContent}>
            <Animated.View
              onLayout={measureTargetFrame}
              ref={messageCardRef}
              style={[
                styles.messageCard,
                { width: overlayMessageWidth },
                animatedMessageStyle,
                target.sourceFrame && !targetFrame ? styles.messageCardHidden : null,
              ]}
            >
              <MessageBubble
                gallerySources={[]}
                isLastInGroup={target.isLastInGroup}
                message={target.playbackMessage.message}
                onImagePress={() => undefined}
                reactionState={messageReactionState}
                showAvatar={target.showAvatar}
                showName={target.showName}
              />
            </Animated.View>

            <Animated.View style={animatedPickerStyle}>
              <NarrativeReactionPicker
                disabled={isClosing}
                onSelect={handleSelect}
                selectedReaction={pickerSelectedReaction}
              />
            </Animated.View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function buildAnimatedMessageStyle({
  progress,
  sourceFrame,
  targetFrame,
}: {
  progress: Animated.Value;
  sourceFrame: ThreadReactionFrame;
  targetFrame: ThreadReactionFrame;
}) {
  const sourceCenterX = sourceFrame.x + sourceFrame.width / 2;
  const sourceCenterY = sourceFrame.y + sourceFrame.height / 2;
  const targetCenterX = targetFrame.x + targetFrame.width / 2;
  const targetCenterY = targetFrame.y + targetFrame.height / 2;
  const startScaleX = sourceFrame.width / targetFrame.width;
  const startScaleY = sourceFrame.height / targetFrame.height;

  return {
    opacity: progress.interpolate({
      inputRange: [0, 0.18, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [sourceCenterX - targetCenterX, 0],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [sourceCenterY - targetCenterY, 0],
        }),
      },
      {
        scaleX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [startScaleX, 1],
        }),
      },
      {
        scaleY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [startScaleY, 1],
        }),
      },
    ],
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  } as ViewStyle,
  overlay: {
    ...StyleSheet.absoluteFillObject,
  } as ViewStyle,
  overlayTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlayStrong,
  } as ViewStyle,
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    width: '100%',
    flex: 1,
  } as ViewStyle,
  focusedContent: {
    alignItems: 'center',
    gap: 18,
    maxWidth: 560,
    width: '100%',
  } as ViewStyle,
  messageCard: {
    alignSelf: 'center',
    maxWidth: '100%',
  } as ViewStyle,
  messageCardHidden: {
    opacity: 0,
  } as ViewStyle,
});
