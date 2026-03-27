import React, { useRef, useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import Svg, { Path } from 'react-native-svg';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';

export function VideoAttachmentView({ 
  attachment 
}: { 
  attachment: Extract<NarrativeAttachmentDto, { _type: 'videoAttachment' }> 
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

const styles = StyleSheet.create({
  attachmentBox: { 
    backgroundColor: theme.colors.cardSubtleBackground, 
    borderRadius: 14, 
    overflow: 'hidden' 
  } as ViewStyle,
  attachmentCaption: { 
    color: theme.colors.cardTextSecondary, 
    fontSize: 14, 
    paddingHorizontal: 12, 
    paddingVertical: 10 
  } as TextStyle,
  videoPlaceholder: { 
    alignItems: 'center', 
    backgroundColor: theme.colors.mediaSurface, 
    height: 200, 
    justifyContent: 'center', 
    width: '100%', 
    overflow: 'hidden' 
  } as ViewStyle,
  videoOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: theme.colors.overlaySoft, 
    alignItems: 'center', 
    justifyContent: 'center' 
  } as ViewStyle,
  playIconCircle: { 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: theme.colors.overlayStrong, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: 1, 
    borderColor: theme.colors.overlayBorder 
  } as ViewStyle,
});
