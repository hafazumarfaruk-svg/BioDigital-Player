import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, ActivityIndicator, Image } from 'react-native';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [audioStreamUrl, setAudioStreamUrl] = useState(null); // [FIX]: অডিও লিংক মেমরিতে সেভ রাখার স্টেট
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
    } catch (e) { console.log(e); }
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
          setAudioStreamUrl(json.audioUrl || json.url); // [FIX]: অডিও লিংক সেভ করা হলো

          if (json.streamType === 'separate' && json.audioUrl) {
              try {
                  await syncAudioRef.current.unloadAsync();
                  await syncAudioRef.current.loadAsync({ uri: json.audioUrl });
              } catch(e) { console.log(e); }
          } else {
              await syncAudioRef.current.unloadAsync();
          }

          setIsPlaying(true);
          setErrorMsg(null);
      } else {
          setErrorMsg("ভিডিও লিংক পাওয়া যায়নি!");
      }
    } catch(e) { 
      setErrorMsg("সার্ভার কানেকশন এরর!");
    }
  };

  const handlePlaybackStatusUpdate = async (status) => {
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

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      if (audioRef.current) {
        await audioRef.current.unloadAsync();
        audioRef.current = null;
      }
      if (syncAudioRef.current) await syncAudioRef.current.unloadAsync();

      const isAudio = data.videoData?.type === 'audio';
      await setBackgroundAudio(isAudio); 

      currentVideoIdRef.current = data.videoId;
      isLocalRef.current = !!(data.videoData && data.videoData.localUri);

      if (videoData?.id === data.videoId) {
        setPlayerState('full');
        setIsAudioMode(isAudio);
        return;
      }

      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setAudioStreamUrl(null);
      setErrorMsg(null);
      setIsPlaying(true);
      setIsAudioMode(isAudio);
      pan.setValue({ x: 0, y: 0 });

      if (isLocalRef.current) {
          setStreamUrl(data.videoData.localUri);
          setAudioStreamUrl(data.videoData.localUri);
          return;
      }

      const targetQuality = global.appSettings?.normalVideo || '720p';
      await fetchStreamUrl(data.videoId, targetQuality);
    });

    const qualitySub = DeviceEventEmitter.addListener('qualityChanged', async (newQuality) => {
      if (currentVideoIdRef.current && !isLocalRef.current) { 
        setIsPlaying(false); 
        setStreamUrl(null);  
        setErrorMsg(null);
        if (syncAudioRef.current) await syncAudioRef.current.unloadAsync();
        setVideoKey(Date.now().toString()); 

        await fetchStreamUrl(currentVideoIdRef.current, newQuality);
      }
    });

    const minSub = DeviceEventEmitter.addListener('minimizeVideo', () => setPlayerState('mini'));
    const maxSub = DeviceEventEmitter.addListener('maximizeVideo', () => {
        if (videoData) setPlayerState('full');
    });

    const toggleAudioSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
        setIsSwitching(true);
        setIsAudioMode(mode);
        await setBackgroundAudio(mode); 

        try {
            if (mode) {
                // [FIX]: অডিও মোডে গেলে মূল ভিডিও এবং সিঙ্ক অডিও—দুটোই পজ হবে
                let currentPos = 0;
                if (videoRef.current) {
                    const status = await videoRef.current.getStatusAsync();
                    currentPos = status.positionMillis || 0;
                    await videoRef.current.pauseAsync(); 
                }
                if (syncAudioRef.current) {
                    await syncAudioRef.current.pauseAsync();
                }

                // [FIX]: মেমরি থেকে সরাসরি অডিও লিংক নিয়ে লোড করা এবং জোরপূর্বক সঠিক সময়ে টেনে নেওয়া
                const targetAudioUrl = audioStreamUrl || streamUrl;
                const { sound } = await Audio.Sound.createAsync(
                    { uri: targetAudioUrl },
                    { shouldPlay: false } // প্রথমে পজ অবস্থায় লোড হবে
                );
                audioRef.current = sound;

                // বাফার হওয়ার পর পজিশন সেট করে তারপর প্লে করা হবে
                await audioRef.current.setPositionAsync(currentPos);
                await audioRef.current.playAsync();
                setIsPlaying(true);

            } else {
                // [FIX]: অডিও মোড থেকে ভিডিওতে ফিরে আসা
                let currentPos = 0;
                if (audioRef.current) {
                    const status = await audioRef.current.getStatusAsync();
                    currentPos = status.positionMillis || 0;
                    await audioRef.current.unloadAsync(); 
                    audioRef.current = null;
                }

                // [সমাধান]: অডিও ইঞ্জিনকে আনলোড হওয়ার পর রিসেট হওয়ার জন্য সামান্য সময় দেওয়া (২০০ms delay)
                setTimeout(async () => {
                    try {
                        if (videoRef.current) {
                            await videoRef.current.setPositionAsync(currentPos);
                            await videoRef.current.playAsync(); 
                        }
                        if (syncAudioRef.current && streamMode === 'separate') {
                            await syncAudioRef.current.setPositionAsync(currentPos);
                            await syncAudioRef.current.playAsync();
                        }
                        setIsPlaying(true);
                    } catch (e) {
                        console.log("Play error after audio unload:", e);
                    }
                }, 200);
            }
        } catch (error) {
            console.log("Switching Error:", error);
        }
        setIsSwitching(false);
    });

    const stopSub = DeviceEventEmitter.addListener('stopVideo', async () => {
      await setBackgroundAudio(false); 
      if (videoRef.current) await videoRef.current.pauseAsync();
      if (audioRef.current) {
          await audioRef.current.unloadAsync();
          audioRef.current = null;
      }
      if (syncAudioRef.current) await syncAudioRef.current.unloadAsync();

      setPlayerState('hidden');
      setStreamUrl(null);
      setAudioStreamUrl(null);
      setIsPlaying(false);
    });

    return () => { 
        playSub.remove(); qualitySub.remove(); minSub.remove(); maxSub.remove(); toggleAudioSub.remove(); stopSub.remove();
    };
  }, [videoData, streamUrl, audioStreamUrl]); // [FIX]: ডিপেন্ডেন্সি আপডেট করা হয়েছে

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

  return (
     <Animated.View 
        style={[isFull ? styles.fullContainer : [styles.miniContainer, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]]} 
        {...(isFull ? {} : panResponder.panHandlers)}
     >
        <TouchableOpacity activeOpacity={0.9} style={styles.touchable} onPress={() => { if (!isFull && videoData) navigation.navigate('Player', { videoId: videoData.id, videoData }); }}>
           <View style={isFull ? styles.fullVideoWrapper : styles.miniVideoWrapper}>
               {errorMsg ? (
                  <View style={styles.loadingBox}><Ionicons name="warning-outline" size={isFull ? 40 : 24} color="#FF4444" /></View>
               ) : streamUrl ? (
                  <View style={{ flex: 1, display: isAudioMode ? 'none' : 'flex' }}>
                    <Video 
                      key={videoKey} 
                      ref={videoRef} 
                      source={{ uri: streamUrl }} 
                      style={styles.video} 
                      shouldPlay={isPlaying && !isAudioMode} 
                      isMuted={streamMode === 'separate'} 
                      useNativeControls={isFull} 
                      resizeMode={isFull ? "contain" : "cover"} 
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