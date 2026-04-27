import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  type ViewStyle,
  type TextStyle,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { computeAmplitude } from 'react-native-audio-analyzer';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';

// ─── Icons ───────────────────────────────────────────────────────────────────

const PlayIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Path
      d="M18.8906 12.846C18.5371 14.189 16.8667 15.1381 13.5257 17.0361C10.296 18.8709 8.6812 19.7884 7.37983 19.4196C6.8418 19.2671 6.35159 18.9776 5.95624 18.5787C5 17.6139 5 15.7426 5 12C5 8.2574 5 6.3861 5.95624 5.42129C6.35159 5.02241 6.8418 4.73289 7.37983 4.58043C8.6812 4.21165 10.296 5.12907 13.5257 6.96387C16.8667 8.86193 18.5371 9.81096 18.8906 11.154C19.0365 11.7084 19.0365 12.2916 18.8906 12.846Z"
      fill="white"
    />
  </Svg>
);

const PauseIcon = () => (
  <Svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <Rect x="6" y="5" width="4" height="14" rx="1" fill="white" />
    <Rect x="14" y="5" width="4" height="14" rx="1" fill="white" />
  </Svg>
);

// ─── Waveform Bars ───────────────────────────────────────────────────────────

const BAR_COUNT = 48;
const WAVEFORM_HEIGHT = 32;
const MIN_BAR_HEIGHT = 2;

interface WaveformBarsProps {
  amplitudes: number[];
  progress: number; // 0..1
  containerWidth: number;
}

function WaveformBars({ amplitudes, progress, containerWidth }: WaveformBarsProps) {
  if (amplitudes.length === 0 || containerWidth === 0) return null;

  // Normalize amplitudes to 0..1 range
  const maxAmp = Math.max(...amplitudes, 0.001);
  const normalized = amplitudes.map((a) => a / maxAmp);

  // Option A: Flexible proportional scaling to fit EXACTLY in the container
  const totalBars = normalized.length;
  const GAP_RATIO = 2 / 3; // Gap is 2/3 the width of a bar
  const totalUnits = totalBars + (totalBars - 1) * GAP_RATIO;
  
  let barW = containerWidth / totalUnits;
  let gapW = barW * GAP_RATIO;

  // Safety cap to prevent bars from looking distorted on tablets or very wide screens
  const MAX_BAR_WIDTH = 3;
  if (barW > MAX_BAR_WIDTH) {
    barW = MAX_BAR_WIDTH;
    gapW = MAX_BAR_WIDTH * GAP_RATIO;
  }

  const totalWidth = totalBars * barW + (totalBars - 1) * gapW;

  return (
    <Svg width={totalWidth} height={WAVEFORM_HEIGHT}>
      {normalized.map((amp, i) => {
        const h = Math.max(MIN_BAR_HEIGHT, amp * WAVEFORM_HEIGHT);
        const x = i * (barW + gapW);
        const y = (WAVEFORM_HEIGHT - h) / 2;
        
        // A bar is dark if it has been played past
        const barProgress = i / totalBars;
        const isFilled = progress >= barProgress;

        return (
          <Rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={barW / 2}
            fill={isFilled ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.15)"}
          />
        );
      })}
    </Svg>
  );
}

// ─── Duration Formatter ──────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AudioAttachmentView({
  attachment,
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'audioAttachment' }>;
}) {
  const [amplitudes, setAmplitudes] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [containerWidth, setContainerWidth] = useState(0);
  const [localPath, setLocalPath] = useState<string | null>(null);

  // ── Download & Analyze ──────────────────────────────────────────────────

  useEffect(() => {
    let isActive = true;

    const prepareAudio = async () => {
      try {
        // Build a stable cache filename from URL
        const cleanUrl = attachment.url.split('?')[0];
        const ext = cleanUrl.match(/\.(mp3|m4a|wav|ogg|aac)$/i)?.[0] ?? '.mp3';
        const filename = `audio_${hashCode(cleanUrl)}${ext}`;
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;

        // Download if not cached
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists) {
          await FileSystem.downloadAsync(attachment.url, fileUri);
        }

        if (!isActive) return;

        // Strip file:// prefix for native path
        const nativePath = fileUri.replace('file://', '');
        setLocalPath(fileUri);

        // Extract amplitude data
        try {
          const amps = computeAmplitude(nativePath, BAR_COUNT);
          if (isActive) setAmplitudes(amps);
        } catch (err) {
          console.warn('computeAmplitude failed, using fallback:', err);
          if (isActive) setAmplitudes(generateFallbackAmplitudes(BAR_COUNT));
        }

        if (isActive) setIsLoading(false);
      } catch (error) {
        console.error('Error preparing audio:', error);
        if (isActive) {
          // Even on download error, show a fallback and stop loading
          setAmplitudes(generateFallbackAmplitudes(BAR_COUNT));
          setIsLoading(false);
        }
      }
    };

    prepareAudio();
    return () => {
      isActive = false;
    };
  }, [attachment.url]);

  // ── Audio Player (expo-audio) ───────────────────────────────────────────

  const player = useAudioPlayer(localPath ?? undefined, { updateInterval: 50 });
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const progress =
    status.duration > 0 ? status.currentTime / status.duration : 0;

  const onTogglePlayback = useCallback(() => {
    if (isLoading || !localPath) return;

    if (isPlaying) {
      player.pause();
    } else {
      // If playback finished, restart from beginning
      if (status.currentTime >= status.duration && status.duration > 0) {
        player.seekTo(0);
      }
      player.play();
    }
  }, [isLoading, localPath, isPlaying, player, status.currentTime, status.duration]);

  // ── Layout ──────────────────────────────────────────────────────────────

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  const timeLabel = isPlaying || status.currentTime > 0
    ? formatDuration(status.currentTime)
    : formatDuration(status.duration);

  return (
    <View style={styles.attachmentBox}>
      <View style={styles.contentContainer}>
        {attachment.title && (
          <Text style={styles.audioTitle} numberOfLines={1}>
            {attachment.title}
          </Text>
        )}

        <View style={styles.waveformRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? 'Audio pausieren' : 'Audio abspielen'}
            accessibilityState={{ disabled: isLoading }}
            style={[styles.playIconCircle, isLoading && styles.disabledButton]}
            onPress={onTogglePlayback}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isPlaying ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </Pressable>

          <View style={styles.waveformWrapper} onLayout={onLayout}>
            {isLoading ? (
              <View style={styles.placeholderWave} />
            ) : (
              <WaveformBars
                amplitudes={amplitudes}
                progress={progress}
                containerWidth={containerWidth}
              />
            )}
          </View>

          <Text style={[styles.durationText, (isLoading || status.duration === 0) && { opacity: 0 }]}>
            {timeLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Simple string hash for deterministic cache filenames */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Deterministic fallback amplitudes when analysis fails */
function generateFallbackAmplitudes(count: number): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / count;
    return 0.2 + 0.3 * Math.sin(t * Math.PI * 2) + 0.15 * Math.sin(t * Math.PI * 5);
  });
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  attachmentBox: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
  } as ViewStyle,
  contentContainer: {
    padding: 0,
  } as ViewStyle,
  audioTitle: {
    color: theme.colors.cardTextPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  } as TextStyle,
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  } as ViewStyle,
  playIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  disabledButton: {
    opacity: 0.6,
  } as ViewStyle,
  waveformWrapper: {
    flex: 1,
    height: WAVEFORM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  } as ViewStyle,
  placeholderWave: {
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.1)',
    width: '100%',
    borderRadius: 1,
  } as ViewStyle,
  durationText: {
    color: theme.colors.cardTextPrimary,
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.6,
    minWidth: 32,
    textAlign: 'right',
  } as TextStyle,
});
