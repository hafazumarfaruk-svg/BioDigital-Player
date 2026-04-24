import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, ActivityIndicator, Image, LogBox } from 'react-native';
import { Audio } from 'expo-av'; // অডিও এবং ব্যাকগ্রাউন্ডের জন্য
import Video from 'react-native-video'; // [NEW]: মেইন ভিডিওর জন্য নেটিভ প্যাকেজ
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

  const checkIsMuxed = () => {
      if (isLocalRef.current) return true; 
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

          if (json.streamType === 'separate' && json.audioUrl) {
              try {
                  await syncAudioRef.current.unloadAsync();
                  await syncAudioRef.current.loadAsync(
                      { uri: json.audioUrl },
                      { shouldPlay: true, positionMillis: seekPosRef.current }
                  );
              } catch(e) {}
          } else {
              try { await syncAudioRef.current.unloadAsync(); } catch(e){}
          }

          setIsPlaying(true);
          setErrorMsg(null);
      } else {
          setErrorMsg("This quality video is not available");
      }
    } catch(e) { 
      setErrorMsg("সার্ভার কানেকশন এরর!");
    }
  };

  // [UPDATED]: react-native-video এর জন্য নতুন সিঙ্ক লজিক
  const handleProgress = async (data) => {
    const currentPosMillis = data.currentTime * 1000;

    if (streamMode === 'separate' && syncAudioRef.current && !isAudioMode) {
        try {
            const audioStatus = await syncAudioRef.current.getStatusAsync();
            if (!audioStatus.isLoaded) return;

            if (isPlaying && !audioStatus.isPlaying) {
                await syncAudioRef.current.playAsync();
            } else if (!isPlaying && audioStatus.isPlaying) {
                await syncAudioRef.current.pauseAsync();
            }

            // যদি অডিও-ভিডিওর গ্যাপ ৭০০ মিলিসেকেন্ডের বেশি হয়, তবে সিঙ্ক করবে
            if (isPlaying && Math.abs(currentPosMillis - audioStatus.positionMillis) > 700) {
                await syncAudioRef.current.setPositionAsync(currentPosMillis);
            }
        } catch(e) {}
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', async () => {
      const savedQuality = global.appSettings?.normalVideo || '720p';
      if (savedQuality !== currentQuality && currentVideoIdRef.current && !isLocalRef.current) {
          setCurrentQuality(savedQuality); 

          setIsPlaying(false); 
          setStreamUrl(null);  
          setErrorMsg(null);

          if (audioRef.current) {
              try { await audioRef.current.unloadAsync(); } catch(e){}
              audioRef.current = null;
          }
          try { await syncAudioRef.current.unloadAsync(); } catch(e){}

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
            const isMuxed = checkIsMuxed();

            if (isMuxed) {
                setIsPlaying(true);
            } else {
                if (syncAudioRef.current) {
                    try { await syncAudioRef.current.pauseAsync(); } catch(e){}
                }

                let targetAudioUrl = audioStreamUrl || streamUrl;

                try {
                    const { sound } = await Audio.Sound.createAsync(
                        { uri: targetAudioUrl },
                        { shouldPlay: true } 
                    );
                    audioRef.current = sound;
                    setIsPlaying(true);
                } catch(e){}
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
                setIsPlaying(true);
                setIsSwitching(false);
                return;
            }

            if (audioRef.current) {
                try {
                    await audioRef.current.unloadAsync(); 
                } catch(e){}
                audioRef.current = null;
            }

            try {
                if (syncAudioRef.current && streamMode === 'separate') {
                    await syncAudioRef.current.playAsync();
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
      try { await syncAudioRef.current.unloadAsync(); } catch(e){}

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
      if (audioRef.current) { try { await audioRef.current.unloadAsync(); audioRef.current = null; } catch(e){} }
      try { await syncAudioRef.current.unloadAsync(); } catch(e){}

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
      try { syncAudioRef.current.unloadAsync(); } catch(e){}
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
  const isCurrentlyMuxed = checkIsMuxed();
  const shouldVideoPlay = isPlaying && (!isAudioMode || isCurrentlyMuxed);
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
                      paused={!shouldVideoPlay}  // [NEW]: react-native-video এর জন্য shouldPlay এর বদলে paused
                      muted={streamMode === 'separate'}
                      controls={isFull && (!isAudioMode || isLocalRef.current)}
                      resizeMode={isFull ? "contain" : "cover"}
                      onProgress={handleProgress} // [NEW]: সিঙ্ক করার ইভেন্ট
                      onLoad={(meta) => {
                         if (seekPosRef.current > 0) {
                             videoRef.current.seek(seekPosRef.current / 1000);
                             seekPosRef.current = 0;
                         }
                      }}
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
                         if (isAudioMode && !isCurrentlyMuxed && audioRef.current) {
                             const status = await audioRef.current.getStatusAsync();
                             if (status?.isPlaying) { await audioRef.current.pauseAsync(); setIsPlaying(false); } 
                             else { await audioRef.current.playAsync(); setIsPlaying(true); }
                         } else {
                             setIsPlaying(!isPlaying);
                         }
                     }}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.miniCloseBtn} onPress={async () => {
                         await setBackgroundAudio(false); 
                         if (audioRef.current) { try { await audioRef.current.unloadAsync(); audioRef.current = null; } catch(e){} }
                         try { await syncAudioRef.current.unloadAsync(); } catch(e){}
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
  video: { width: '100%', height: '100%', backgroundColor: '#000' },
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