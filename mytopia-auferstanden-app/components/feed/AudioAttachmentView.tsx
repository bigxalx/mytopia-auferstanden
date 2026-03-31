import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle, ActivityIndicator } from 'react-native';
import { Waveform, type IWaveformRef, PlayerState } from '@simform_solutions/react-native-audio-waveform';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Path, Rect } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';

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

export function AudioAttachmentView({
  attachment
}: {
  attachment: Extract<NarrativeAttachmentDto, { _type: 'audioAttachment' }>
}) {
  const waveformRef = useRef<IWaveformRef>(null);
  const [playerState, setPlayerState] = useState(PlayerState.stopped);
  const [isWaveformLoading, setIsWaveformLoading] = useState(true);
  const [localPath, setLocalPath] = useState<string | null>(null);

  /**
   * Standard Fix: Download the file locally before passing to the waveform library.
   * This ensures the native decoder can access the file data for peak extraction.
   */
  useEffect(() => {
    let isActive = true;
    const downloadAudio = async () => {
      try {
        const cleanUrl = attachment.url.split('?')[0];
        const filename = cleanUrl.split('/').pop() || `audio_${Date.now()}.mp3`;
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;

        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (!fileInfo.exists) {
          await FileSystem.downloadAsync(attachment.url, fileUri);
        }

        if (isActive) {
          setLocalPath(fileUri);
        }
      } catch (error) {
        console.error('Error caching audio for waveform:', error);
      }
    };

    downloadAudio();
    return () => { isActive = false; };
  }, [attachment.url]);

  const onTogglePlayback = async () => {
    if (!waveformRef.current || isWaveformLoading) return;

    try {
      if (playerState === PlayerState.playing) {
        await waveformRef.current.pausePlayer();
      } else if (playerState === PlayerState.paused) {
        await waveformRef.current.resumePlayer();
      } else {
        await waveformRef.current.startPlayer();
      }
    } catch (error) {
      console.warn('Waveform playback failed:', error);
    }
  };

  const isPlaying = playerState === PlayerState.playing;

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
            accessibilityLabel={isPlaying ? "Pause audio" : "Play audio"}
            accessibilityState={{ disabled: isWaveformLoading }}
            style={[styles.playIconCircle, isWaveformLoading && styles.disabledButton]}
            onPress={onTogglePlayback}
          >
            {isWaveformLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : isPlaying ? (
              <PauseIcon />
            ) : (
              <PlayIcon />
            )}
          </Pressable>

          <View style={styles.waveformWrapper}>
            {localPath ? (
              <Waveform
                key={localPath} // Force-remount on new path to avoid player instance clashing
                ref={waveformRef}
                mode="static"
                path={localPath.replace('file://', '')} // Strip file:// for native file handling
                candleWidth={3}
                candleSpace={2}
                candleHeightScale={8} // Amplifies quieter tracks
                waveColor="rgba(0,0,0,0.2)"
                scrubColor="black"
                containerStyle={styles.waveformContainer}
                onPlayerStateChange={setPlayerState}
                onChangeWaveformLoadState={setIsWaveformLoading}
              />
            ) : (
              <View style={styles.placeholderWave} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  attachmentBox: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4
  } as ViewStyle,
  contentContainer: {
    padding: 0,
  } as ViewStyle,
  audioTitle: {
    color: theme.colors.cardTextPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8
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
    height: 40,
    justifyContent: 'center',
  } as ViewStyle,
  waveformContainer: {
    width: '100%',
    height: '100%',
  } as ViewStyle,
  placeholderWave: {
    height: 2,
    backgroundColor: 'rgba(0,0,0,0.1)',
    width: '100%',
    borderRadius: 1,
  } as ViewStyle,
});
