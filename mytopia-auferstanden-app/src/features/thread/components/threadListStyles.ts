import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { theme } from '@/src/shared/ui/theme';

export const threadListStyles = StyleSheet.create({
  scrollView: {
    backgroundColor: theme.colors.background,
  } as ViewStyle,
  scrollContent: {
    padding: 20,
    paddingBottom: 24,
  } as ViewStyle,
  messageRow: {
    marginBottom: 12,
  } as ViewStyle,
  playerMessageRow: {
    alignItems: 'flex-end',
  } as ViewStyle,
  npcMessageRow: {
    alignItems: 'flex-start',
  } as ViewStyle,
  centeredMessageRow: {
    alignItems: 'center',
  } as ViewStyle,
  stateBox: {
    alignItems: 'center',
    backgroundColor: theme.colors.headerBackground,
    borderRadius: 12,
    gap: 8,
    marginTop: 24,
    padding: 20,
  } as ViewStyle,
  stateText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  } as TextStyle,
  loadingMoreWrap: {
    alignItems: 'center',
    paddingTop: 16,
  } as ViewStyle,
  daySeparatorWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 28,
  } as ViewStyle,
  daySeparatorLine: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    flex: 1,
    height: 1,
  } as ViewStyle,
  daySeparatorPill: {
    alignItems: 'center',
    backgroundColor: '#3D4344',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 100,
    paddingHorizontal: 12,
    paddingVertical: 6,
  } as ViewStyle,
  daySeparatorText: {
    color: 'rgba(238, 242, 239, 0.88)',
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 12,
    textAlign: 'center',
  } as TextStyle,
  typingAvatarColumn: {
    alignItems: 'center',
    bottom: -32,
    left: 0,
    position: 'absolute',
    width: 48,
  } as ViewStyle,
  typingBubbleWrap: {
    marginLeft: 60,
    maxWidth: '100%',
  } as ViewStyle,
  typingBubbleWrapInline: {
    marginLeft: 60,
  } as ViewStyle,
  typingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.beige,
    borderBottomLeftRadius: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  } as ViewStyle,
  typingDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  } as ViewStyle,
  typingDot: {
    backgroundColor: 'rgba(31, 41, 55, 0.45)',
    borderRadius: 999,
    height: 7,
    width: 7,
  } as ViewStyle,
  newMessagesContainer: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 100,
  } as ViewStyle,
  newMessagesButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.orange,
    borderRadius: 25,
    elevation: 8,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  } as ViewStyle,
  newMessagesText: {
    color: 'white',
    fontFamily: 'Nunito_700Bold',
    fontSize: 14,
    fontWeight: '700',
  } as TextStyle,
  scrollToEndButtonWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 110,
  } as ViewStyle,
  scrollToEndPressable: {} as ViewStyle,
  scrollToEndPressed: {
    opacity: 0.82,
  } as ViewStyle,
  scrollToEndButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 10,
    height: 38,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 38,
  } as ViewStyle,
  scrollToEndButtonFallback: {
    backgroundColor: 'rgba(237, 236, 224, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  } as ViewStyle,
});
