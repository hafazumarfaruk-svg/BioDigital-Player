import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { usePlayerStore } from './PlayerStore';

const { width } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;

export default function GlobalVideoPlayer() {
  const { videoId, videoData, videoUrl, audioUrl, streamMode, playerState, setPlayerState, closePlayer, captions, selectedCC, setSelectedCC } = usePlayerStore();
  const videoRef = useRef(null);
  const audioRef = useRef(new Audio.Sound());
  const navigation = useNavigation();
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [showCCMenu, setShowCCMenu] = useState(false);

  useEffect(() => {
    const loadAudio = async () => {
      if (streamMode === 'separate' && audioUrl) {
        try {
          await audioRef.current.unloadAsync();
          await audioRef.current.loadAsync({ uri: audioUrl }, { shouldPlay: isPlaying });
        } catch (e) {}
      }
    };
    if (videoId) loadAudio();
    return () => { audioRef.current.unloadAsync(); };
  }, [videoId, audioUrl]);

  const handlePlaybackStatusUpdate = async (status) => {
    if (streamMode === 'separate' && status.isLoaded) {
        const audioStatus = await audioRef.current.getStatusAsync();
        if (!audioStatus.isLoaded) return;
        if (status.isPlaying && !audioStatus.isPlaying) await audioRef.current.playAsync();
        else if (!status.isPlaying && audioStatus.isPlaying) await audioRef.current.pauseAsync();
        if (status.isPlaying && Math.abs(status.positionMillis - audioStatus.positionMillis) > 500) {
            await audioRef.current.setPositionAsync(status.positionMillis);
        }
    }
  };

  if (playerState === 'hidden' || !videoUrl) return null;

  const handleClose = async () => {
      if (videoRef.current) await videoRef.current.pauseAsync();
      await audioRef.current.unloadAsync();
      closePlayer();
  };

  const togglePlayPause = async () => {
     if (videoRef.current) {
        const status = await videoRef.current.getStatusAsync();
        if (status.isPlaying) {
            await videoRef.current.pauseAsync();
            if(streamMode === 'separate') await audioRef.current.pauseAsync();
            setIsPlaying(false);
        } else {
            await videoRef.current.playAsync();
            if(streamMode === 'separate') await audioRef.current.playAsync();
            setIsPlaying(true);
        }
     }
  };

  const expandPlayer = () => {
     setPlayerState('full');
     navigation.navigate('Player', { videoId, videoData });
  };

  if (playerState === 'full') {
      return (
          <View style={styles.fullMode} pointerEvents="box-none">
             <Video 
                ref={videoRef} source={{ uri: videoUrl, textTracks: selectedCC ? [{ title: selectedCC.label, language: selectedCC.language, type: 'text/vtt', uri: selectedCC.uri }] : [] }} 
                style={styles.fullVideo} useNativeControls resizeMode="contain" shouldPlay isMuted={streamMode === 'separate'} 
                onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                selectedTextTrack={selectedCC ? { type: "language", value: selectedCC.language } : { type: "disabled" }}
              />
              
              {captions.length > 0 && (
                <TouchableOpacity style={styles.ccBtn} onPress={() => setShowCCMenu(!showCCMenu)}>
                  <Ionicons name="subtitles" size={24} color={selectedCC ? "#3EA6FF" : "#FFF"} />
                </TouchableOpacity>
              )}

              {showCCMenu && (
                <View style={styles.ccMenu}>
                  <Text style={styles.menuTitle}>Captions / Translation</Text>
                  <ScrollView>
                    <TouchableOpacity style={styles.menuItem} onPress={() => { setSelectedCC(null); setShowCCMenu(false); }}>
                      <Text style={{color: !selectedCC ? '#3EA6FF' : '#FFF'}}>Off</Text>
                    </TouchableOpacity>
                    {captions.map((track, idx) => (
                      <TouchableOpacity key={idx} style={styles.menuItem} onPress={() => { setSelectedCC(track); setShowCCMenu(false); }}>
                        <Text style={{color: selectedCC?.language === track.language ? '#3EA6FF' : '#FFF'}}>{track.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
          </View>
      );
  }

  return (
    <TouchableOpacity style={styles.miniMode} activeOpacity={1} onPress={expandPlayer}>
       <View style={styles.miniPlayerVideoWrapper}>
          <Video ref={videoRef} source={{ uri: videoUrl }} style={styles.miniVideo} shouldPlay={isPlaying} isMuted={streamMode === 'separate'} resizeMode="cover" onPlaybackStatusUpdate={handlePlaybackStatusUpdate} />
       </View>
       <View style={styles.miniPlayerTextContainer}>
          <Text style={styles.miniPlayerTitle} numberOfLines={1}>{videoData?.title}</Text>
          <Text style={styles.miniPlayerSubTitle} numberOfLines={1}>{videoData?.channel}</Text>
       </View>
       <TouchableOpacity style={styles.miniPlayerBtn} onPress={togglePlayPause}>
          <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
       </TouchableOpacity>
       <TouchableOpacity style={styles.miniPlayerBtn} onPress={handleClose}>
          <Ionicons name="close" size={26} color="#FFF" />
       </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fullMode: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, backgroundColor: '#000', zIndex: 9999 },
  fullVideo: { width: '100%', height: '100%' },
  ccBtn: { position: 'absolute', top: 10, right: 15, zIndex: 20, padding: 5, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20 },
  ccMenu: { position: 'absolute', top: 50, right: 10, width: 200, maxHeight: 250, backgroundColor: '#1E1E1E', borderRadius: 10, padding: 15, zIndex: 10000, elevation: 10, borderWidth: 1, borderColor: '#333' },
  menuTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' },
  menuItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  miniMode: { position: 'absolute', bottom: 60, left: 0, width: '100%', height: 60, backgroundColor: '#212121', borderTopWidth: 1, borderTopColor: '#333', zIndex: 10000, flexDirection: 'row', alignItems: 'center', elevation: 10 },
  miniPlayerVideoWrapper: { width: 110, height: 60, backgroundColor: '#000' },
  miniVideo: { width: '100%', height: '100%' },
  miniPlayerTextContainer: { flex: 1, paddingHorizontal: 10, justifyContent: 'center' },
  miniPlayerTitle: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  miniPlayerSubTitle: { color: '#AAA', fontSize: 11 },
  miniPlayerBtn: { padding: 12 }
});