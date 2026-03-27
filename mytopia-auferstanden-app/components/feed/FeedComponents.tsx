import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type TextStyle,
  type ImageStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Link } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import {
  type NarrativeAttachmentDto,
  type NarrativeMessageDto,
} from '@/src/features/feed/data/narrativeFeedClient';

export function MessageBubble({
  message,
  showAvatar,
  showName,
  gallerySources,
  onImagePress,
  containerStyle,
}: {
  message: NarrativeMessageDto;
  showAvatar: boolean;
  showName: boolean;
  gallerySources: { uri: string }[];
  onImagePress: (idx: number) => void;
  containerStyle?: ViewStyle;
}) {
  return (
    <View style={[styles.messageRow, containerStyle]}>
      <View style={styles.avatarColumn}>
        {showAvatar && <ActorAvatar actor={message.actor} />}
      </View>
      <View style={styles.bubbleContainer}>
        <View style={styles.messageBubble}>
          {showName && (
            <Text
              style={[
                styles.headline,
                message.actor.nameColor ? { color: message.actor.nameColor } : {},
              ]}
            >
              {message.actor.name}
            </Text>
          )}
          {message.attachment && (
            <AttachmentView
              attachment={message.attachment}
              gallerySources={gallerySources}
              onImagePress={onImagePress}
            />
          )}
          {message.text && <Text style={styles.messageText}>{message.text}</Text>}
        </View>
      </View>
    </View>
  );
}

function ActorAvatar({ actor }: { actor: { avatarUrl?: string; name: string } }) {
  if (actor.avatarUrl) {
    return (
      <Image
        source={{ uri: actor.avatarUrl }}
        style={styles.avatarImage}
        contentFit="cover"
        cachePolicy="disk"
        transition={200}
        placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
      />
    );
  }
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackLabel}>
        {actor.name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function AttachmentView({
  attachment,
  gallerySources,
  onImagePress,
}: {
  attachment: NarrativeAttachmentDto;
  gallerySources: { uri: string }[];
  onImagePress: (idx: number) => void;
}) {
  switch (attachment._type) {
    case 'imageAttachment': {
      const index = gallerySources.findIndex((s) => s.uri === attachment.url);
      return (
        <Pressable style={styles.attachmentBox} onPress={() => index >= 0 && onImagePress(index)}>
          <Image
            source={{ uri: attachment.url }}
            style={styles.imageAttachment}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          />
          {attachment.caption && <Text style={styles.attachmentCaption}>{attachment.caption}</Text>}
        </Pressable>
      );
    }
    case 'videoAttachment':
      return <VideoAttachmentView attachment={attachment} />;
    case 'audioAttachment':
      return <AudioAttachmentView attachment={attachment} />;
    case 'missionAttachment': {
      const description =
        attachment.excerpt ||
        [
          attachment.missionKind
            ? attachment.missionKind === 'quiz'
              ? '🧠 Quiz'
              : '📍 GPS'
            : null,
          attachment.missionPoints ? `${attachment.missionPoints} Punkte` : null,
        ]
          .filter(Boolean)
          .join(' · ');
      return (
        <Link asChild href={`/tasks/${attachment.missionId}`}>
          <Pressable style={styles.orange}>
            {attachment.imageUrl && (
              <Image
                source={{ uri: attachment.imageUrl }}
                style={styles.missionCardImage}
                contentFit="cover"
                cachePolicy="disk"
                transition={200}
                placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
              />
            )}
            <View style={styles.missionCardContent}>
              <Text style={styles.missionTitle}>
                {attachment.title || attachment.missionTitle || 'Mission'}
              </Text>
              {description ? <Text style={styles.missionExcerpt}>{description}</Text> : null}
            </View>
          </Pressable>
        </Link>
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Video — uses expo-video (useVideoPlayer + VideoView)
// ---------------------------------------------------------------------------

function VideoAttachmentView({
  attachment,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'videoAttachment' }>;
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const player = useVideoPlayer(attachment.url, (p) => {
    p.muted = false;
    p.loop = false;
    p.staysActiveInBackground = false;
  });
  const videoViewRef = useRef<VideoView>(null);

  useEffect(() => {
    const subscription = player.addListener('videoTrackChange', (payload) => {
      if (payload.videoTrack?.size) {
        setAspectRatio(payload.videoTrack.size.width / payload.videoTrack.size.height);
      }
    });
    return () => subscription.remove();
  }, [player]);

  const handlePress = () => {
    player.play();
    videoViewRef.current?.enterFullscreen();
  };

  return (
    <Pressable style={styles.attachmentBox} onPress={handlePress}>
      <View style={[styles.videoPlaceholder, { aspectRatio, height: undefined }]}>
        <VideoView
          ref={videoViewRef}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit={isFullscreen ? 'contain' : 'cover'}
          nativeControls={isFullscreen}
          onFullscreenEnter={() => setIsFullscreen(true)}
          onFullscreenExit={() => {
            setIsFullscreen(false);
            player.pause();
          }}
        />
        <View style={styles.videoOverlay}>
          <View style={styles.playIconCircle}>
            <Svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <Path
                d="M18.8906 12.846C18.5371 14.189 16.8667 15.1381 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42129C6.35159 5.02241 6.8418 4.73289 7.37983 4.58043C8.6812 4.21165 10.296 5.12907 13.5257 6.96387C16.8667 8.86193 18.5371 9.81096 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z"
                fill="white"
              />
            </Svg>
          </View>
        </View>
      </View>
      {attachment.title && <Text style={styles.attachmentCaption}>{attachment.title}</Text>}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Audio — uses expo-audio (useAudioPlayer + useAudioPlayerStatus)
// ---------------------------------------------------------------------------

function AudioAttachmentView({
  attachment,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'audioAttachment' }>;
}) {
  const audioPlayer = useAudioPlayer({ uri: attachment.url });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false);
  const [playbackWarning, setPlaybackWarning] = useState<string | null>(null);
  const playbackAttemptAtRef = useRef<number | null>(null);

  const isLikelyProblematicAndroidFormat =
    Platform.OS === 'android' &&
    (attachment.extension?.toLowerCase() === 'm4a' ||
      attachment.mimeType?.toLowerCase() === 'audio/x-m4a' ||
      attachment.url.toLowerCase().includes('.m4a'));

  useEffect(() => {
    if (!audioStatus.playing && !audioStatus.isBuffering && playbackAttemptAtRef.current) {
      const timer = setTimeout(() => {
        if (!audioStatus.playing && !audioStatus.isBuffering) {
          setPlaybackWarning(
            isLikelyProblematicAndroidFormat ? 'Format issues detected.' : 'Audio did not start.',
          );
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [audioStatus.playing, audioStatus.isBuffering, isLikelyProblematicAndroidFormat]);

  const onTogglePlayback = async () => {
    if (isPreparingPlayback) return;
    if (audioStatus.playing) {
      audioPlayer.pause();
      return;
    }
    try {
      playbackAttemptAtRef.current = Date.now();
      setIsPreparingPlayback(true);
      await setAudioModeAsync({ playsInSilentMode: true });
      if (audioStatus.didJustFinish) await audioPlayer.seekTo(0);
      audioPlayer.play();
    } catch {
      /* soft fail */
    } finally {
      setIsPreparingPlayback(false);
    }
  };

  const label =
    isPreparingPlayback || audioStatus.isBuffering
      ? '...'
      : audioStatus.playing
        ? 'Pause'
        : 'Play';

  return (
    <View style={styles.attachmentBox}>
      <View style={styles.audioHeader}>
        <Text style={styles.audioTitle}>{attachment.title || 'Audio'}</Text>
        <Pressable style={styles.orange} onPress={() => void onTogglePlayback()}>
          <Text style={styles.audioButtonLabel}>{label}</Text>
        </Pressable>
      </View>
      {playbackWarning && <Text style={styles.attachmentCaption}>{playbackWarning}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative',
  } as ViewStyle,
  avatarColumn: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 48,
  } as ViewStyle,
  bubbleContainer: {
    flex: 1,
    marginLeft: 60,
  } as ViewStyle,
  messageBubble: {
    backgroundColor: theme.colors.beige,
    borderRadius: 10,
    flex: 1,
    padding: 10,
    gap: 8,
  } as ViewStyle,
  headline: {
    color: theme.colors.charcoal,
    fontFamily: 'NunitoSans_700Bold',
    fontSize: 13,
  } as TextStyle,
  messageText: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
  } as TextStyle,
  avatarImage: {
    borderRadius: 24,
    height: 48,
    width: 48,
  } as ImageStyle,
  avatarFallback: {
    alignItems: 'center',
    backgroundColor: theme.colors.avatarFallback,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  } as ViewStyle,
  avatarFallbackLabel: {
    color: theme.colors.avatarFallbackText,
    fontSize: 18,
    fontWeight: '700',
  } as TextStyle,
  attachmentBox: {
    backgroundColor: theme.colors.cardSubtleBackground,
    borderRadius: 14,
    overflow: 'hidden',
  } as ViewStyle,
  attachmentCaption: {
    color: theme.colors.cardTextSecondary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as TextStyle,
  imageAttachment: {
    height: 220,
    width: '100%',
  } as ImageStyle,
  videoPlaceholder: {
    alignItems: 'center',
    backgroundColor: theme.colors.mediaSurface,
    height: 200,
    justifyContent: 'center',
    width: '100%',
    overflow: 'hidden',
  } as ViewStyle,
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlaySoft,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  playIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.overlayBorder,
  } as ViewStyle,
  orange: {
    backgroundColor: theme.colors.orange,
    borderRadius: 10,
    padding: 5,
  } as ViewStyle,
  audioHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  } as ViewStyle,
  audioTitle: {
    color: theme.colors.cardTextPrimary,
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    marginRight: 12,
  } as TextStyle,
  audioButtonLabel: {
    color: theme.colors.cardTextPrimary,
    fontSize: 13,
    fontWeight: '700',
  } as TextStyle,
  missionCardImage: {
    borderRadius: 6,
    height: 140,
    width: '100%',
  } as ImageStyle,
  missionCardContent: {
    paddingHorizontal: 4,
    paddingBottom: 2,
  } as ViewStyle,
  missionTitle: {
    color: theme.colors.cardTextPrimary,
    fontFamily: 'Nunito_700Bold',
    fontSize: 15,
  } as TextStyle,
  missionExcerpt: {
    color: theme.colors.cardTextSecondary,
    fontFamily: 'NunitoSans_400Regular',
    fontSize: 12,
    marginTop: 2,
  } as TextStyle,
});
