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
    if (!q) return '720';
    const s = String(q).toLowerCase();
    if (s.includes('144')) return '144';
    if (s.includes('240')) return '240';
    if (s.includes('360')) return '360';
    if (s.includes('480')) return '480';
    if (s.includes('720')) return '720';
    if (s.includes('1080')) return '1080';
    return '720';
};

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoRef = useRef(null);
  const audioRef = useRef(null); // স্বাধীন অডিও ইঞ্জিন
  
  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [videoKey, setVideoKey] = useState(Date.now().toString()); 
  
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false); // লোডিং স্টেট
  
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const fetchStreamUrl = async (vidId, targetQuality) => {
    try {
      const numQ = getNumericQuality(targetQuality);
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${numQ}&merge=true&t=${Date.now()}`;
      const res = await fetch(apiUrl);
      const json = await res.json();
      if (json.success && json.url) {
          setStreamUrl(json.url);
          setErrorMsg(null);
      } else {
          setErrorMsg("ভিডিও লিংক পাওয়া যায়নি!");
      }
    } catch(e) { 
      setErrorMsg("সার্ভার কানেকশন এরর!");
    }
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      // যদি আগে থেকে কোনো অডিও চলতে থাকে, তা ক্লিন করা
      if (audioRef.current) {
        await audioRef.current.unloadAsync();
        audioRef.current = null;
      }

      if (videoData?.id === data.videoId) {
        setPlayerState('full');
        setIsAudioMode(data.videoData?.type === 'audio');
        return;
      }
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setErrorMsg(null);
      setIsPlaying(true);
      setIsAudioMode(data.videoData?.type === 'audio');
      pan.setValue({ x: 0, y: 0 });

      if (data.videoData && data.videoData.localUri) {
          setStreamUrl(data.videoData.localUri);
          return;
      }

      let targetQuality = '720p';
      try {
        const savedAppSet = await AsyncStorage.getItem('appSettings');
        if (savedAppSet) {
            const parsed = JSON.parse(savedAppSet);
            if (parsed.normalVideo) targetQuality = parsed.normalVideo;
        }
      } catch(e) {}

      await fetchStreamUrl(data.videoId, targetQuality);
    });

    const qualitySub = DeviceEventEmitter.addListener('qualityChanged', async (newQuality) => {
      if (videoData && !videoData.localUri) { 
        setStreamUrl(null); 
        setVideoKey(Date.now().toString()); 
        await fetchStreamUrl(videoData.id, newQuality);
      }
    });

    const minSub = DeviceEventEmitter.addListener('minimizeVideo', () => setPlayerState('mini'));
    const maxSub = DeviceEventEmitter.addListener('maximizeVideo', () => {
        if (videoData) setPlayerState('full');
    });

    // [FIX]: True Audio Mode Switching Logic (টাইমস্ট্যাম্প সিংক)
    const toggleAudioSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
        setIsSwitching(true);
        setIsAudioMode(mode);

        try {
            if (mode) {
                // ভিডিও থেকে অডিওতে যাওয়া
                if (videoRef.current) {
                    const status = await videoRef.current.getStatusAsync();
                    await videoRef.current.pauseAsync(); // ভিডিও ইঞ্জিন বন্ধ
                    
                    const { sound } = await Audio.Sound.createAsync(
                        { uri: streamUrl },
                        { shouldPlay: true, positionMillis: status.positionMillis } // ঠিক একই সেকেন্ড থেকে শুরু
                    );
                    audioRef.current = sound;
                    setIsPlaying(true);
                }
            } else {
                // অডিও থেকে ভিডিওতে ফিরে আসা
                if (audioRef.current) {
                    const status = await audioRef.current.getStatusAsync();
                    await audioRef.current.unloadAsync(); // অডিও ইঞ্জিন সম্পূর্ণ ধ্বংস
                    audioRef.current = null;
                    
                    if (videoRef.current) {
                        await videoRef.current.setPositionAsync(status.positionMillis);
                        await videoRef.current.playAsync(); // ভিডিও ইঞ্জিন চালু
                        setIsPlaying(true);
                    }
                }
            }
        } catch (error) {
            console.log("Switching Error:", error);
        }
        
        setIsSwitching(false);
    });

    return () => { 
        playSub.remove(); qualitySub.remove(); minSub.remove(); maxSub.remove(); toggleAudioSub.remove();
    };
  }, [videoData, streamUrl]);

  // কম্পোনেন্ট ডিলিট হওয়ার সময় অডিও মেমরি ক্লিনআপ
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.unloadAsync();
      }
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
                  // অডিও মোড অন থাকলে ভিডিও কম্পোনেন্ট রেন্ডারই হবে না, সম্পূর্ণ হাইড থাকবে
                  <View style={{ flex: 1, display: isAudioMode ? 'none' : 'flex' }}>
                    <Video 
                      key={videoKey} 
                      ref={videoRef} source={{ uri: streamUrl }} style={styles.video} 
                      shouldPlay={isPlaying && !isAudioMode} useNativeControls={isFull} resizeMode={isFull ? "contain" : "cover"} 
                    />
                  </View>
               ) : (
                  <View style={styles.loadingBox}><ActivityIndicator size={isFull ? "large" : "small"} color="#FF0000" /></View>
               )}

               {/* সুইচ করার সময় ১ সেকেন্ডের বাফারিং স্পিনার */}
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
                         if (videoRef.current) await videoRef.current.pauseAsync();
                         if (audioRef.current) await audioRef.current.unloadAsync();
                         setPlayerState('hidden'); setVideoData(null); setStreamUrl(null); pan.setValue({ x:0, y:0 });
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