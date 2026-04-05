import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, PanResponder } from 'react-native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;

// মিনি প্লেয়ারের ডাইমেনশন (স্ক্রিনশট অনুযায়ী 16:9 অ্যাসপেক্ট রেশিও)
const MINI_WIDTH = width * 0.45; 
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;

const MY_API_SERVER = "http://127.0.0.1:10000";

global.appSettings = global.appSettings || {};

const getNumericQuality = (q) => {
    if (!q) return '720';
    if (q.includes('Auto') || q.includes('Normal')) return '720';
    if (q.includes('75p') || q.includes('Anti') || q.includes('Low')) return '144'; 
    if (q.includes('144p')) return '144';
    if (q.includes('240p')) return '240';
    if (q.includes('360p')) return '360';
    if (q.includes('480p')) return '480';
    if (q.includes('720p')) return '720';
    if (q.includes('1080p')) return '1080';
    if (q.includes('1440p') || q.includes('2K')) return '1440';
    if (q.includes('2160p') || q.includes('4K') || q.toLowerCase().includes('4k')) return '2160';
    if (q.includes('4320p') || q.includes('8K') || q.toLowerCase().includes('8k')) return '4320';
    return '720'; 
};

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoRef = useRef(null);
  
  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);

  // ভাসমান অ্যানিমেশন এবং কোঅর্ডিনেট ট্র্যাক করার জন্য Animated Value
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // ড্র্যাগ (Drag) বা সরানোর লজিক
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // শুধুমাত্র ৩ পিক্সেলের বেশি নড়লে এটিকে 'ড্র্যাগ' হিসেবে ধরবে (ক্লিকের সাথে কনফ্লিক্ট এড়াতে)
        return Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: pan.x._value,
          y: pan.y._value
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        
        // স্ক্রিনের বাইরে যেন চলে না যায়, তার জন্য গাণিতিক বাউন্ডিং বক্স (Bounding Box)
        let newX = pan.x._value;
        let newY = pan.y._value;

        const maxRight = 10;
        const maxLeft = -(width - MINI_WIDTH - 20);
        const maxDown = 20;
        const maxUp = -(height - MINI_HEIGHT - 120);

        if (newX > maxRight) newX = maxRight;
        if (newX < maxLeft) newX = maxLeft;
        if (newY > maxDown) newY = maxDown;
        if (newY < maxUp) newY = maxUp;

        // স্ক্রিনের বাইরে গেলে স্প্রিং অ্যানিমেশনের মাধ্যমে ভেতরে ফেরত আসবে
        Animated.spring(pan, {
          toValue: { x: newX, y: newY },
          friction: 6,
          useNativeDriver: false
        }).start();
      }
    })
  ).current;

  useEffect(() => {
    const playSubscription = DeviceEventEmitter.addListener('playVideo', async (data) => {
      if (videoData?.id === data.videoId) {
          setPlayerState('full');
          return;
      }
      
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setIsPlaying(true);

      // মিনি প্লেয়ারের পজিশন রিসেট করা
      pan.setValue({ x: 0, y: 0 });

      try {
        const qualityStr = global.appSettings?.normalVideo || '720p';
        const numericQuality = getNumericQuality(qualityStr);
        
        const targetUrl = `https://www.youtube.com/watch?v=${data.videoId}`;
        const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(targetUrl)}&quality=${numericQuality}&t=${Date.now()}`;
        
        const res = await fetch(apiUrl);
        const json = await res.json();
        if (json.success && json.url) setStreamUrl(json.url);
      } catch(e) { console.error(e); }
    });

    const minimizeSubscription = DeviceEventEmitter.addListener('minimizeVideo', () => {
      setPlayerState('mini');
    });

    return () => { 
        playSubscription.remove(); 
        minimizeSubscription.remove(); 
    };
  }, [videoData]);

  if (playerState === 'hidden') return null;

  const togglePlay = async () => {
     if (!videoRef.current) return;
     const status = await videoRef.current.getStatusAsync();
     if (status.isPlaying) { 
         await videoRef.current.pauseAsync(); 
         setIsPlaying(false); 
     } else { 
         await videoRef.current.playAsync(); 
         setIsPlaying(true); 
     }
  };

  const closePlayer = async () => {
     if (videoRef.current) await videoRef.current.pauseAsync();
     setPlayerState('hidden');
     setVideoData(null);
     setStreamUrl(null);
     pan.setValue({ x: 0, y: 0 }); // মেমোরি ক্লিয়ার
  };

  const expandToFull = () => {
     if (videoData) {
        setPlayerState('full');
        navigation.navigate('Player', { videoId: videoData.id, videoData: videoData });
     }
  };

  if (playerState === 'full') {
     return (
       <View style={styles.fullContainer} pointerEvents="box-none">
          <View style={styles.fullVideoWrapper}>
             {streamUrl ? (
                <Video 
                   ref={videoRef} 
                   source={{ uri: streamUrl }} 
                   style={styles.video} 
                   shouldPlay={isPlaying} 
                   useNativeControls={true} 
                   resizeMode="contain" 
                />
             ) : (
                <View style={styles.loadingBox} />
             )}
          </View>
       </View>
     );
  }

  // মিনি/ভাসমান (PiP) মোড
  return (
     <Animated.View 
        style={[
          styles.miniContainer, 
          { transform: [{ translateX: pan.x }, { translateY: pan.y }] }
        ]}
        {...panResponder.panHandlers}
     >
        <TouchableOpacity activeOpacity={0.9} style={styles.miniTouchable} onPress={expandToFull}>
           <View style={styles.miniVideoWrapper}>
               {streamUrl ? (
                  <Video 
                     ref={videoRef} 
                     source={{ uri: streamUrl }} 
                     style={styles.video} 
                     shouldPlay={isPlaying} 
                     useNativeControls={false} 
                     resizeMode="cover" 
                  />
               ) : (
                  <View style={styles.loadingBox} />
               )}
               
               {/* স্ক্রিনশটের হুবহু লেআউট: ভিডিওর উপরের বাটন ওভারলে */}
               <View style={styles.overlay}>
                  <TouchableOpacity style={styles.miniPlayBtn} onPress={togglePlay}>
                     <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.miniCloseBtn} onPress={closePlayer}>
                     <Ionicons name="close" size={24} color="#FFF" />
                  </TouchableOpacity>
               </View>
           </View>
        </TouchableOpacity>
     </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  fullVideoWrapper: { flex: 1, backgroundColor: '#000', width: '100%', height: '100%' },
  
  // ভাসমান (Draggable) মিনি প্লেয়ারের স্টাইল
  miniContainer: { 
    position: 'absolute', 
    bottom: 80, // বটম বারের উপরে থাকার জন্য
    right: 15,  // ডান দিকে থাকার জন্য
    width: MINI_WIDTH, 
    height: MINI_HEIGHT, 
    backgroundColor: '#000', 
    zIndex: 9999, 
    elevation: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  
  miniTouchable: { flex: 1, width: '100%', height: '100%' },
  miniVideoWrapper: { flex: 1, width: '100%', height: '100%', backgroundColor: '#111', position: 'relative' },
  
  video: { width: '100%', height: '100%' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },

  // ভিডিওর উপরের ওভারলে (স্ক্রিনশট অনুযায়ী)
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.2)', // হালকা ডার্ক টিন্ট যেন আইকনগুলো স্পষ্ট বোঝা যায়
  },
  miniPlayBtn: {
    position: 'absolute',
    top: '50%',
    left: 10,
    marginTop: -13, // আইকনের উচ্চতার অর্ধেক
  },
  miniCloseBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 2,
  }
});