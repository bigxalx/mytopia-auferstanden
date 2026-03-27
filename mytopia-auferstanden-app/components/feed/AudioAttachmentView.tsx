import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { theme } from '@/src/shared/ui/theme';
import { type NarrativeAttachmentDto } from '@/src/features/feed/data/narrativeFeedClient';

export function AudioAttachmentView({ 
  attachment 
}: { 
  attachment: Extract<NarrativeAttachmentDto, { _type: 'audioAttachment' }> 
}) {
  const player = useAudioPlayer(attachment.url);
  const [playbackWarning, setPlaybackWarning] = useState<string | null>(null);

  // Sync basic state for the UI label
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  useEffect(() => {
    const playingSub = player.addListener('playingChange', (payload) => {
      setIsPlaying(payload.isPlaying);
    });
    const statusSub = player.addListener('statusChange', (status) => {
      setIsBuffering(status === 'loading');
    });
    return () => {
      playingSub.remove();
      statusSub.remove();
    };
  }, [player]);

  const onTogglePlayback = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const label = isBuffering ? '...' : (isPlaying ? 'Pause' : 'Play');

  return (
    <View style={styles.attachmentBox}>
      <View style={styles.audioHeader}>
        <Text style={styles.audioTitle} numberOfLines={1}>
          {attachment.title || 'Audio'}
        </Text>
        <Pressable style={styles.orange} onPress={onTogglePlayback}>
          <Text style={styles.audioButtonLabel}>{label}</Text>
        </Pressable>
      </View>
      {playbackWarning && <Text style={styles.attachmentCaption}>{playbackWarning}</Text>}
    </View>
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
  audioHeader: { 
    alignItems: 'center', 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    padding: 12 
  } as ViewStyle,
  audioTitle: { 
    color: theme.colors.cardTextPrimary, 
    flex: 1, 
    fontSize: 15, 
    fontWeight: '600', 
    marginRight: 12 
  } as TextStyle,
  audioButtonLabel: { 
    color: theme.colors.cardTextPrimary, 
    fontSize: 13, 
    fontWeight: '700' 
  } as TextStyle,
  orange: { 
    backgroundColor: theme.colors.orange, 
    borderRadius: 10, 
    padding: 5 
  } as ViewStyle,
});
