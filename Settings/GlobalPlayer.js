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
  const syncAudioRef = useRef(new Audio.Sound()); 

  const currentVideoIdRef = useRef(null);
  const isLocalRef = useRef(false);
  const isAudioModeRef = useRef(false); 
  const seekPosRef = useRef(0);

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

  const checkIsMuxed = () => {
      global.appSettings = global.appSettings || {};
      const currentQNum = parseInt(getNumericQuality(global.appSettings.normalVideo || '720'));
      return [360, 480, 720].includes(currentQNum) || streamMode === 'combined';
  };

  const setBackgroundAudio = async (enable) => {
    try {
        await Audio.setAudioModeAsync({
            staysActiveInBackground: enable,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });
    } catch (e) { console.log(e); }
  };

  const fetchStreamUrl = async (vidId, targetQuality) => {
    const requestedQ = getNumericQuality(targetQuality);
    setErrorMsg(null);

    try {
        const apiUrl = `${MY_API_SERVER}/api/fast-play?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${requestedQ}&type=video`;
        const res = await fetch(apiUrl);
        const json = await res.json();

        if (json.success && json.url) {
            setStreamMode(json.streamType || 'combined');
            
            if (json.streamType === 'separate' && json.audioUrl) {
                Promise.all([
                    syncAudioRef.current.unloadAsync(),
                    setStreamUrl(json.url),
                    setAudioStreamUrl(json.audioUrl)
                ]).then(() => {
                    syncAudioRef.current.loadAsync(
                        { uri: json.audioUrl }, 
                        { shouldPlay: true, positionMillis: seekPosRef.current, progressUpdateIntervalMillis: 100 } 
                    ).catch(e => console.log(e));
                });
            } else {
                await syncAudioRef.current.unloadAsync();
                setStreamUrl(json.url);
                setAudioStreamUrl(json.url);
            }

            setIsPlaying(true);
            setErrorMsg(null);
        } else {
            setErrorMsg("This quality video is not available");
        }
    } catch(e) { 
        setErrorMsg("This quality video is not available");
    }
  };

  const handlePlaybackStatusUpdate = async (status) => {
    if (status.isLoaded && seekPosRef.current > 0) {
        const pos = seekPosRef.current;
        seekPosRef.current = 0; 
        try { await videoRef.current.setPositionAsync(pos); } catch(e){}
    }

    if (streamMode === 'separate' && syncAudioRef.current && status.isLoaded && !isAudioMode) {
        const audioStatus = await syncAudioRef.current.getStatusAsync();
        if (!audioStatus.isLoaded) return;

        if (status.isPlaying && !audioStatus.isPlaying) {
            await syncAudioRef.current.playAsync();
        } else if (!status.isPlaying && audioStatus.isPlaying) {
            await syncAudioRef.current.pauseAsync();
        }

        if (status.isPlaying && Math.abs(status.positionMillis - audioStatus.positionMillis) > 500) {
            await syncAudioRef.current.setPositionAsync(status.positionMillis);
        }
    }
  };

  // =========================================================
  // [NEW]: SettingsScreen এর সিগন্যাল ধরার প্রধান লিসেনার
  // =========================================================
  useEffect(() => {
    const qualitySub = DeviceEventEmitter.addListener('qualityChanged', async (newQuality) => {
      if (currentVideoIdRef.current && !isLocalRef.current) { 
        
        let currentPos = 0;
        if (videoRef.current) {
            try {
                const status = await videoRef.current.getStatusAsync();
                currentPos = status.positionMillis || 0;
                await videoRef.current.pauseAsync();
            } catch(e){}
        }

        seekPosRef.current = currentPos; // ভিডিওর পজিশন সেভ রাখা
        setIsPlaying(false); 
        setStreamUrl(null);  
        setErrorMsg(null);
        
        if (audioRef.current) {
            await audioRef.current.unloadAsync();
            audioRef.current = null;
        }
        if (syncAudioRef.current) await syncAudioRef.current.unloadAsync();
        
        setVideoKey(Date.now().toString()); 
        
        // নতুন কোয়ালিটিতে ভিডিও রিলোড করা হচ্ছে
        await fetchStreamUrl(currentVideoIdRef.current, newQuality);
      }
    });

    return () => { qualitySub.remove(); };
  }, []);

  useEffect(() => {
    const switchToAudioMode = async () => {
        setIsSwitching(true);
        setIsAudioMode(true);
        isAudioModeRef.current = true;
        await setBackgroundAudio(true); 

        try {
            const isMuxed = checkIsMuxed();

            if (isMuxed) {
                if (videoRef.current) await videoRef.current.playAsync();
                setIsPlaying(true);
            } else {
                let currentPos = 0;
                if (videoRef.current) {
                    const status = await videoRef.current.getStatusAsync();
                    currentPos = status.positionMillis || 0;
                    await videoRef.current.pauseAsync(); 
                }
                if (syncAudioRef.current) await syncAudioRef.current.pauseAsync();

                let targetAudioUrl = null; 
                if (!isLocalRef.current && currentVideoIdRef.current) {
                    try {
                        const apiUrl = `${MY_API_SERVER}/api/fast-play?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${currentVideoIdRef.current}`)}&type=audio`;
                        const res = await fetch(apiUrl);
                        const json = await res.json();
                        if (json.success && json.audioUrl) targetAudioUrl = json.audioUrl;
                        else if (json.success && json.url) targetAudioUrl = json.url; 
                    } catch(e) {}
                }

                if (!targetAudioUrl) targetAudioUrl = audioStreamUrl || streamUrl;

                const { sound } = await Audio.Sound.createAsync(
                    { uri: targetAudioUrl },
                    { shouldPlay: true, positionMillis: currentPos } 
                );
                audioRef.current = sound;
                setIsPlaying(true);
            }
        } catch (error) {}
        setIsSwitching(false);
    };

    const switchToVideoMode = async () => {
        setIsSwitching(true);
        setIsAudioMode(false);
        isAudioModeRef.current = false;
        await setBackgroundAudio(false); 

        try {
            const isMuxed = checkIsMuxed();

            if (isMuxed) {
                if (videoRef.current) await videoRef.current.playAsync();
                setIsPlaying(true);
                setIsSwitching(false);
                return;
            }

            let currentPos = 0;
            if (audioRef.current) {
                const status = await audioRef.current.getStatusAsync();
                currentPos = status.positionMillis || 0;
                
                Promise.all([
                    audioRef.current.unloadAsync(),
                    videoRef.current ? videoRef.current.setPositionAsync(currentPos) : Promise.resolve(),
                    syncAudioRef.current && streamMode === 'separate' ? syncAudioRef.current.setPositionAsync(currentPos) : Promise.resolve()
                ]).then(async () => {
                     audioRef.current = null;
                     if (videoRef.current) await videoRef.current.playAsync();
                     if (syncAudioRef.current && streamMode === 'separate') await syncAudioRef.current.playAsync();
                     setIsPlaying(true);
                     setIsSwitching(false);
                });
            } else { setIsSwitching(false); }
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

      if (audioRef.current) { await audioRef.current.unloadAsync(); audioRef.current = null; }
      if (syncAudioRef.current) await syncAudioRef.current.unloadAsync();

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
      if (videoRef.current) await videoRef.current.pauseAsync();
      if (audioRef.current) { await audioRef.current.unloadAsync(); audioRef.current = null; }
      if (syncAudioRef.current) await syncAudioRef.current.unloadAsync();

      setPlayerState('hidden');
      setStreamUrl(null);
      setAudioStreamUrl(null);
      setIsPlaying(false);
    });

    return () => { 
        playSub.remove(); 
        minSub.remove(); 
        maxSub.remove(); 
        toggleAudioSub.remove(); 
        stopSub.remove(); 
    };
  }, [videoData, streamUrl, audioStreamUrl, streamMode]); 

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.unloadAsync();
      if (syncAudioRef.current) syncAudioRef.current.unloadAsync();
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
  
  const isCurrentlyMuxed = [360, 480, 720].includes(parseInt(getNumericQuality(global.appSettings.normalVideo || '720'))) || streamMode === 'combined';
  const shouldVideoPlay = isPlaying && (!isAudioMode || isCurrentlyMuxed);

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
                  <View style={{ flex: 1, display: isAudioMode ? 'none' : 'flex' }}>
                    <Video 
                      key={videoKey} 
                      ref={videoRef} 
                      source={{ uri: streamUrl }} 
                      style={styles.video} 
                      shouldPlay={shouldVideoPlay} 
                      isMuted={streamMode === 'separate'} 
                      useNativeControls={isFull} 
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

               {isAudioMode && (
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
                         if (isAudioMode && !isCurrentlyMuxed && audioRef.current) {
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
                         if (videoRef.current) await videoRef.current.pauseAsync();
                         if (audioRef.current) await audioRef.current.unloadAsync();
                         if (syncAudioRef.current) await syncAudioRef.current.unloadAsync();
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
  video: { width: '100%', height: '100%' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  switchingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50, justifyContent: 'center', alignItems: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  miniPlayBtn: { position: 'absolute', top: '50%', left: 10, marginTop: -13 },
  miniCloseBtn: { position: 'absolute', top: 4, right: 4, padding: 2 },
  audioPosterContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: '#111' },
  audioPosterBg: { width: '100%', height: '100%', opacity: 0.5 },
  audioPosterOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  audioIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0, 191, 165, 0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#00BFA5', marginBottom: 10 },
  audioPosterText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});