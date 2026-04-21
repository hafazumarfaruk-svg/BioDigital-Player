import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, ActivityIndicator, Image, LogBox } from 'react-native';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

LogBox.ignoreLogs(['[expo-av] Expo AV has been deprecated']);

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;
const MINI_WIDTH = width * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;
const MY_API_SERVER = "http://127.0.0.1:10000"; 

const getNumericQuality = (q) => {
    if (!q || String(q).toLowerCase() === 'auto') return '720';
    const match = String(q).match(/\d+/);
    return match ? match[0] : '720';
};

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoRef = useRef(null);
  const audioRef = useRef(null); 

  const seekPosRef = useRef(0);
  const currentVideoIdRef = useRef(null);
  const isLocalRef = useRef(false);
  const isAudioModeRef = useRef(false); 

  const [currentQuality, setCurrentQuality] = useState(global.appSettings?.normalVideo || '720p');
  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [audioStreamUrl, setAudioStreamUrl] = useState(null); 
  const [streamMode, setStreamMode] = useState('combined'); 

  const [isPlaying, setIsPlaying] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [videoKey, setVideoKey] = useState(Date.now().toString()); 

  const [isAudioMode, setIsAudioMode] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false); 

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const setBackgroundAudio = async (enable) => {
    try {
        await Audio.setAudioModeAsync({
            staysActiveInBackground: enable,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });
    } catch (e) {}
  };

  const fetchStreamUrl = async (vidId, targetQuality) => {
    try {
      const numQ = getNumericQuality(targetQuality);
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${numQ}&merge=true&t=${Date.now()}`;

      const res = await fetch(apiUrl);
      const json = await res.json();

      if (json.success && json.url) {
          setStreamMode(json.streamType || 'combined');
          setStreamUrl(json.url); 
          setAudioStreamUrl(json.audioUrl || json.url); 

          setIsPlaying(true);
          setErrorMsg(null);
      } else {
          setErrorMsg("This quality video is not available");
      }
    } catch(e) { 
      setErrorMsg("সার্ভার কানেকশন এরর!");
    }
  };

  const handlePlaybackStatusUpdate = async (status) => {
    if (status.isLoaded && seekPosRef.current > 0) {
        const pos = seekPosRef.current;
        seekPosRef.current = 0; 
        try { await videoRef.current.setPositionAsync(pos); } catch(e){}
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', async () => {
      const savedQuality = global.appSettings?.normalVideo || '720p';
      if (savedQuality !== currentQuality && currentVideoIdRef.current && !isLocalRef.current) {
          setCurrentQuality(savedQuality); 

          let currentPos = 0;
          if (videoRef.current) {
              try {
                  const status = await videoRef.current.getStatusAsync();
                  currentPos = status.positionMillis || 0;
                  await videoRef.current.pauseAsync();
              } catch(e){}
          }

          seekPosRef.current = currentPos;
          setIsPlaying(false); 
          setStreamUrl(null);  
          setErrorMsg(null);

          if (audioRef.current) {
              try { await audioRef.current.unloadAsync(); } catch(e){}
              audioRef.current = null;
          }

          setVideoKey(Date.now().toString()); 
          await fetchStreamUrl(currentVideoIdRef.current, savedQuality);
      }
    });
    return unsubscribe;
  }, [navigation, currentQuality]);

  useEffect(() => {
    const switchToAudioMode = async () => {
        setIsSwitching(true);
        setIsAudioMode(true);
        isAudioModeRef.current = true;
        await setBackgroundAudio(true); 

        try {
            let currentPos = 0;
            if (videoRef.current) {
                try {
                    const status = await videoRef.current.getStatusAsync();
                    currentPos = status.positionMillis || 0;
                    await videoRef.current.pauseAsync(); 
                } catch(e){}
            }

            const targetAudioUrl = audioStreamUrl || streamUrl;

            try {
                const { sound } = await Audio.Sound.createAsync(
                    { uri: targetAudioUrl },
                    { shouldPlay: true, positionMillis: currentPos } 
                );
                audioRef.current = sound;
                setIsPlaying(true);
            } catch(e){}
        } catch (error) {}
        setIsSwitching(false);
    };

    const switchToVideoMode = async () => {
        setIsSwitching(true);
        setIsAudioMode(false);
        isAudioModeRef.current = false;
        await setBackgroundAudio(false); 

        try {
            let currentPos = 0;
            if (audioRef.current) {
                try {
                    const status = await audioRef.current.getStatusAsync();
                    currentPos = status.positionMillis || 0;
                    await audioRef.current.unloadAsync(); 
                } catch(e){}
                audioRef.current = null;
            }

            try {
                if (videoRef.current) {
                    await videoRef.current.setPositionAsync(currentPos);
                    await videoRef.current.playAsync(); 
                }
            } catch(e){}

            setIsPlaying(true);
            setIsSwitching(false);
        } catch (e) { setIsSwitching(false); }
    };

    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      const isAudio = data.videoData?.type === 'audio';

      if (videoData?.id === data.videoId) {
        setPlayerState('full');
        if (isAudioModeRef.current) await switchToVideoMode();
        else {
            setIsAudioMode(isAudio);
            isAudioModeRef.current = isAudio;
            await setBackgroundAudio(isAudio);
        }
        return; 
      }

      if (audioRef.current) { 
          try { await audioRef.current.unloadAsync(); } catch(e){}
          audioRef.current = null; 
      }

      setIsAudioMode(isAudio);
      isAudioModeRef.current = isAudio;
      await setBackgroundAudio(isAudio); 

      currentVideoIdRef.current = data.videoId;
      isLocalRef.current = !!(data.videoData && data.videoData.localUri);

      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setAudioStreamUrl(null);
      setErrorMsg(null);
      setIsPlaying(true);
      pan.setValue({ x: 0, y: 0 });

      if (isLocalRef.current) {
          setStreamMode('combined');
          setStreamUrl(data.videoData.localUri);
          setAudioStreamUrl(data.videoData.localUri);
          return;
      }

      global.appSettings = global.appSettings || {};
      const targetQuality = global.appSettings.normalVideo || '720p';
      seekPosRef.current = 0; 
      await fetchStreamUrl(data.videoId, targetQuality);
    });

    const minSub = DeviceEventEmitter.addListener('minimizeVideo', () => setPlayerState('mini'));
    const maxSub = DeviceEventEmitter.addListener('maximizeVideo', () => { if (videoData) setPlayerState('full'); });

    const toggleAudioSub = DeviceEventEmitter.addListener('toggleAudioMode', (mode) => {
        if (mode) switchToAudioMode();
        else switchToVideoMode();
    });

    const stopSub = DeviceEventEmitter.addListener('stopVideo', async () => {
      await setBackgroundAudio(false); 
      if (videoRef.current) { try { await videoRef.current.pauseAsync(); } catch(e){} }
      if (audioRef.current) { try { await audioRef.current.unloadAsync(); audioRef.current = null; } catch(e){} }

      setPlayerState('hidden');
      setStreamUrl(null);
      setAudioStreamUrl(null);
      setIsPlaying(false);
    });

    return () => { playSub.remove(); minSub.remove(); maxSub.remove(); toggleAudioSub.remove(); stopSub.remove(); };
  }, [videoData, streamUrl, audioStreamUrl, streamMode]); 

  useEffect(() => {
    return () => {
      if (audioRef.current) { try{ audioRef.current.unloadAsync(); } catch(e){} }
    };
  }, []);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
      let x = pan.x._value, y = pan.y._value;
      if (x > 10) x = 10; if (x < -(width - MINI_WIDTH - 20)) x = -(width - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(height - MINI_HEIGHT - 120)) y = -(height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  if (playerState === 'hidden') return null;
  const isFull = playerState === 'full';

  // [FIXED]: অফলাইন বা অডিও মোডের কন্ট্রোল ঠিক রাখা হয়েছে
  const shouldVideoPlay = isPlaying && !isAudioMode;
  const hideVideo = isAudioMode && !isLocalRef.current;
  const showCustomPoster = isAudioMode && !isLocalRef.current;

  return (
     <Animated.View 
        style={[isFull ? styles.fullContainer : [styles.miniContainer, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]]} 
        {...(isFull ? {} : panResponder.panHandlers)}
     >
        <TouchableOpacity activeOpacity={0.9} style={styles.touchable} onPress={() => { if (!isFull && videoData) navigation.navigate('Player', { videoId: videoData.id, videoData }); }}>
           <View style={isFull ? styles.fullVideoWrapper : styles.miniVideoWrapper}>

               {errorMsg ? (
                  <View style={styles.loadingBox}>
                      <Ionicons name="warning-outline" size={isFull ? 40 : 24} color="#FF4444" />
                      <Text style={{color: '#FF4444', marginTop: 10, fontSize: isFull ? 16 : 12, textAlign: 'center', paddingHorizontal: 10}}>
                          {errorMsg}
                      </Text>
                  </View>
               ) : streamUrl ? (
                  <View style={[styles.videoCoreWrapper, hideVideo && styles.hiddenVideoStyle]}>
                    <Video 
                      key={videoKey} 
                      ref={videoRef} 
                      source={{ uri: streamUrl }} 
                      style={styles.video} 
                      shouldPlay={shouldVideoPlay} 
                      isMuted={false} // [CRITICAL FIX]: এখন ভিডিও নিজেই অডিও চালাবে

                      useNativeControls={isFull && (!isAudioMode || isLocalRef.current)} 
                      usePoster={isAudioMode && isLocalRef.current}
                      posterSource={{ uri: videoData?.thumbnail }}
                      posterStyle={{ resizeMode: 'cover' }}

                      resizeMode={isFull ? "contain" : "cover"} 
                      progressUpdateIntervalMillis={500}
                      onPlaybackStatusUpdate={handlePlaybackStatusUpdate} 
                    />
                  </View>
               ) : (
                  <View style={styles.loadingBox}><ActivityIndicator size={isFull ? "large" : "small"} color="#FF0000" /></View>
               )}

               {isSwitching && (
                  <View style={styles.switchingOverlay}>
                    <ActivityIndicator size="large" color="#00BFA5" />
                  </View>
               )}

               {showCustomPoster && (
                  <View style={styles.audioPosterContainer}>
                    <Image source={{ uri: videoData?.thumbnail }} style={styles.audioPosterBg} blurRadius={isFull ? 15 : 5} />
                    <View style={styles.audioPosterOverlay}>
                      <View style={[styles.audioIconCircle, !isFull && { width: 40, height: 40, borderRadius: 20 }]}>
                        <Ionicons name="musical-notes" size={isFull ? 50 : 20} color="#FFF" />
                      </View>
                      {isFull && <Text style={styles.audioPosterText}>ব্যাকগ্রাউন্ড অডিও প্লে হচ্ছে</Text>}
                    </View>
                  </View>
               )}

               {!isFull && (
                  <View style={[styles.overlay, isAudioMode ? {zIndex: 20} : {}]}>
                     <TouchableOpacity style={styles.miniPlayBtn} onPress={async () => {
                         if (isAudioMode && audioRef.current) {
                             const status = await audioRef.current.getStatusAsync();
                             if (status?.isPlaying) { await audioRef.current.pauseAsync(); setIsPlaying(false); } 
                             else { await audioRef.current.playAsync(); setIsPlaying(true); }
                         } else if (videoRef.current) {
                             const status = await videoRef.current.getStatusAsync();
                             if (status?.isPlaying) { await videoRef.current.pauseAsync(); setIsPlaying(false); } 
                             else { await videoRef.current.playAsync(); setIsPlaying(true); }
                         }
                     }}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.miniCloseBtn} onPress={async () => {
                         await setBackgroundAudio(false); 
                         if (videoRef.current) { try { await videoRef.current.pauseAsync(); } catch(e){} }
                         if (audioRef.current) { try { await audioRef.current.unloadAsync(); audioRef.current = null; } catch(e){} }
                         setPlayerState('hidden'); setVideoData(null); setStreamUrl(null); setAudioStreamUrl(null); pan.setValue({ x:0, y:0 });
                     }}>
                        <Ionicons name="close" size={24} color="#FFF" />
                     </TouchableOpacity>
                  </View>
               )}
           </View>
        </TouchableOpacity>
     </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  miniContainer: { position: 'absolute', bottom: 80, right: 15, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', zIndex: 9999, elevation: 15, borderRadius: 12, overflow: 'hidden' },
  touchable: { flex: 1, width: '100%', height: '100%' },
  fullVideoWrapper: { flex: 1, backgroundColor: '#000', width: '100%', height: '100%', position: 'relative' },
  miniVideoWrapper: { flex: 1, width: '100%', height: '100%', backgroundColor: '#111', position: 'relative', borderRadius: 12, overflow: 'hidden' },
  videoCoreWrapper: { flex: 1, width: '100%', height: '100%' },
  hiddenVideoStyle: { position: 'absolute', opacity: 0, width: 1, height: 1, left: -9999 },
  video: { width: '100%', height: '100%' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  switchingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  audioPosterContainer: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  audioPosterBg: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  audioPosterOverlay: { alignItems: 'center', justifyContent: 'center' },
  audioIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,191,165,0.3)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  audioPosterText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  miniPlayBtn: { padding: 10 },
  miniCloseBtn: { padding: 10 },
});