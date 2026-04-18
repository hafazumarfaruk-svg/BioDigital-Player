import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, PanResponder, Share, FlatList, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { Video } from 'expo-av';
import * as FileSystem from 'expo-file-system'; 

const { width, height } = Dimensions.get('window');
const STABLE_USER_AGENT = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36";
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function ShortsScreen({ initialVideoId, route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [isAutoSkipping, setIsAutoSkipping] = useState(false);
  const [shortsLoading, setShortsLoading] = useState(true);
  
  const [showUnmuteBtn, setShowUnmuteBtn] = useState(false);
  const [showActionBtns, setShowActionBtns] = useState(false);
  
  const [currentUrl, setCurrentUrl] = useState(`https://m.youtube.com/shorts/${initialVideoId || route?.params?.videoId || ''}`);
  const [currentChannel, setCurrentChannel] = useState({ name: 'Unknown Channel', isSubscribed: false });
  
  const subscribeTimerRef = useRef(null);
  const currentChannelNameRef = useRef(''); 
  const shortsWebViewRef = useRef(null);

  const [isOffline, setIsOffline] = useState(false);
  const [cachedShorts, setCachedShorts] = useState([]);
  const [visibleIndex, setVisibleIndex] = useState(0); 

  const targetUri = initialVideoId || route?.params?.videoId ? `https://m.youtube.com/shorts/${initialVideoId || route?.params?.videoId}` : "https://m.youtube.com/shorts";

  const restartActionTimer = () => {
    setShowActionBtns(false);
    if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
    subscribeTimerRef.current = setTimeout(() => {
      setShowActionBtns(true);
    }, 15000); 
  };

  const checkAndLoadCache = async () => {
    try {
      const cacheLimit = global.appSettings?.shortsCacheLimit || 3600000; 
      const now = Date.now();
      let saved = await AsyncStorage.getItem('cached_shorts');
      
      if (saved) {
        let parsed = JSON.parse(saved);
        const validItems = [];
        
        for (const item of parsed) {
          const fileInfo = await FileSystem.getInfoAsync(item.uri);
          
          if (fileInfo.exists) {
            if (now - item.timestamp > cacheLimit) {
              try { await FileSystem.deleteAsync(item.uri, { idempotent: true }); } catch(e) {}
            } else {
              const finalUri = item.uri.startsWith('file://') ? item.uri : `file://${item.uri}`;
              validItems.push({ ...item, uri: finalUri });
            }
          }
        }
        
        setCachedShorts(validItems);
        if (validItems.length !== parsed.length) {
          await AsyncStorage.setItem('cached_shorts', JSON.stringify(validItems));
        }
      }
    } catch (e) {
      console.log("Cache Load Error:", e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (isOffline) {
        checkAndLoadCache();
      }
    }, [isOffline])
  );

  useEffect(() => {
    setShortsLoading(true);
    setShowUnmuteBtn(false);
    
    checkAndLoadCache();

    const timerLoading = setTimeout(() => setShortsLoading(false), 2000);
    const timerUnmute = setTimeout(() => setShowUnmuteBtn(true), 10000); 
    
    restartActionTimer();

    return () => { 
      clearTimeout(timerLoading); 
      clearTimeout(timerUnmute); 
      if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
    };
  }, [targetUri, isFocused]);

  const handleNativeSubscribe = async () => {
    let channelNameToSave = currentChannel.name;
    if (!channelNameToSave || channelNameToSave === 'Unknown Channel' || channelNameToSave === 'Loading...') return; 

    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      let parsedSubs = subs ? JSON.parse(subs) : [];
      const isSubbed = parsedSubs.some(s => s.name === channelNameToSave);
      
      if (isSubbed) {
        parsedSubs = parsedSubs.filter(s => s.name !== channelNameToSave);
      } else {
        parsedSubs.push({ id: Date.now().toString(), name: channelNameToSave, avatar: 'https://via.placeholder.com/150' });
      }
      
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(parsedSubs));
      setCurrentChannel(prev => ({ ...prev, isSubscribed: !isSubbed }));
    } catch (e) {}
  };

  const handleShare = async () => {
    try { await Share.share({ message: `Check out this amazing short video: ${currentUrl}` }); } catch (error) {}
  };

  const handleUnmutePress = () => {
    if (shortsWebViewRef.current) {
      shortsWebViewRef.current.injectJavaScript(`
        var video = document.querySelector('video');
        if(video) { video.muted = false; video.play().catch(e=>{}); }
        var unmuteBtn = document.querySelector('.ytp-unmute, .ytm-unmute, button[aria-label*="unmute"]');
        if (unmuteBtn) { unmuteBtn.click(); }
        true;
      `);
      setShowUnmuteBtn(false); 
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true, 
      onStartShouldSetPanResponderCapture: () => false, 
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (evt, gestureState) => {
        const { dy } = gestureState;
        if (dy < -40) {
          restartActionTimer(); 
          shortsWebViewRef.current?.injectJavaScript(`
            window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
            var scrollable = document.querySelector('ytm-shorts-viewer') || document.body;
            if(scrollable) scrollable.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
            true;
          `);
        } else if (dy > 40) {
          restartActionTimer(); 
          shortsWebViewRef.current?.injectJavaScript(`
            window.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
            var scrollable = document.querySelector('ytm-shorts-viewer') || document.body;
            if(scrollable) scrollable.scrollBy({ top: -window.innerHeight, behavior: 'smooth' });
            true;
          `);
        }
      }
    })
  ).current;

  const checkSubscription = async (name) => {
    try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        const parsedSubs = subs ? JSON.parse(subs) : [];
        setCurrentChannel({ name: name, isSubscribed: parsedSubs.some(s => s.name === name) });
    } catch(e){}
  };

  const fetchDirectUrlAndCache = async (vId, channel) => {
    try {
        if (!vId) return;
        
        let saved = await AsyncStorage.getItem('cached_shorts');
        let parsed = saved ? JSON.parse(saved) : [];
        
        if (parsed.some(c => c.videoId === vId)) return; 

        const apiUrl = `${MY_API_SERVER}/api/extract?url=https://www.youtube.com/watch?v=${vId}&quality=360`;
        const res = await fetch(apiUrl);
        const json = await res.json();

        if (json.success && json.url) {
            const fileName = `short_${vId}.mp4`;
            const fileUri = FileSystem.cacheDirectory + fileName;

            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            if (!fileInfo.exists) {
                const dl = await FileSystem.downloadAsync(json.url, fileUri);
                if (dl.status === 200) {
                    const newShort = { id: vId, videoId: vId, uri: dl.uri, channel: channel, timestamp: Date.now() };
                    
                    parsed.unshift(newShort);
                    if(parsed.length > 20) { 
                        const removed = parsed.pop();
                        FileSystem.deleteAsync(removed.uri, {idempotent: true}).catch(()=>{});
                    }
                    
                    await AsyncStorage.setItem('cached_shorts', JSON.stringify(parsed));
                    setCachedShorts(parsed);
                }
            }
        }
    } catch(e) {
        console.log("Caching Error:", e);
    }
  };

  const onShortsMessage = async (event) => {
    const rawData = event.nativeEvent.data;
    if (rawData === "SKIP_START") setIsAutoSkipping(true);
    else if (rawData === "SKIP_END") setIsAutoSkipping(false);
    else {
        try {
          const data = JSON.parse(rawData);
          
          if (data.type === 'NEW_VIDEO_STARTED') {
              if (data.url) setCurrentUrl(data.url); 
              if (data.videoId) {
                  fetchDirectUrlAndCache(data.videoId, data.channel);
              }
          }
          
          if (data.type === 'CHANNEL_SYNC' && data.name) {
              if (currentChannelNameRef.current !== data.name) {
                  currentChannelNameRef.current = data.name;
                  checkSubscription(data.name);
              }
          }
        } catch (e) {}
    }
  };

  const handleShouldStartLoadWithRequest = (request) => {
    const url = request.url;
    if (url.includes('youtube.com/@') || url.includes('/channel/') || url.includes('/c/')) {
      let extractedName = 'YouTube Channel';
      if (url.includes('/@')) extractedName = '@' + url.split('/@')[1].split('/')[0].split('?')[0];
      navigation.navigate('Channel', { channelName: extractedName });
      return false; 
    }
    return true;
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
        setVisibleIndex(viewableItems[0].index);
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;