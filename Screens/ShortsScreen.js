import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, PanResponder, Share, FlatList, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useIsFocused } from '@react-navigation/native';
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
          if (now - item.timestamp > cacheLimit) {
            try { await FileSystem.deleteAsync(item.uri, { idempotent: true }); } catch(e) {}
          } else {
            validItems.push(item);
          }
        }
        
        setCachedShorts(validItems);
        if (validItems.length !== parsed.length) {
          await AsyncStorage.setItem('cached_shorts', JSON.stringify(validItems));
        }
      }
    } catch (e) {}
  };

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
  }, [targetUri, isFocused]);const handleNativeSubscribe = async () => {
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

  const shortsInjectScript = `
    (function() {
        const style = document.createElement('style');
        style.innerHTML = \`
            ytm-mobile-topbar-renderer, ytm-pivot-bar-renderer, header, .ytm-bottom-sheet { display: none !important; }
            ytm-ad-slot-renderer, ytm-promoted-sparkles-web-renderer, .ad-showing, .ad-interrupting, [is-ad], ytm-companion-ad-renderer { display: none !important; opacity: 0 !important; pointer-events: none !important; }
            .reel-player-header-subscribe-button, .ytm-subscribe-button-renderer { opacity: 0 !important; pointer-events: none !important; display: none !important; }
        \`;
        document.head.appendChild(style);
        
        let activeVideoId = "";

        setInterval(() => {
            let activeReel = document.querySelector('ytm-reel-video-renderer[is-active]');
            if (!activeReel) {
                const reelsList = document.querySelectorAll('ytm-reel-video-renderer');
                for (let i = 0; i < reelsList.length; i++) {
                    const rect = reelsList[i].getBoundingClientRect();
                    if (rect.top > -200 && rect.top < window.innerHeight / 2) {
                        activeReel = reelsList[i];
                        break;
                    }
                }
            }

            if (activeReel) {
                const vid = activeReel.querySelector('video');
                const uniqueId = activeReel.id || (vid ? vid.src : "");
                
                var channelName = '';
                var linkElem = activeReel.querySelector('a[href^="/@"]');
                if (linkElem) {
                    var hrefVal = linkElem.getAttribute('href');
                    channelName = hrefVal.split('?')[0].replace('/', ''); 
                } else {
                    var textElements = activeReel.querySelectorAll('.yt-core-attributed-string, .reel-channel-name, .ytm-reel-channel-renderer span, h2');
                    for (var k = 0; k < textElements.length; k++) {
                        var txt = textElements[k].innerText ? textElements[k].innerText.trim() : '';
                        if (txt.length > 0 && txt !== 'Subscribe' && txt !== 'সাবস্ক্রাইব') {
                            channelName = txt;
                            break;
                        }
                    }
                }

                let vId = "";
                const match = window.location.href.match(/\\/shorts\\/([a-zA-Z0-9_-]+)/);
                if(match && match[1]) {
                    vId = match[1];
                }

                if (uniqueId && uniqueId !== activeVideoId) {
                    activeVideoId = uniqueId;
                    window.ReactNativeWebView.postMessage(JSON.stringify({ 
                        type: 'NEW_VIDEO_STARTED',
                        url: window.location.href,
                        videoId: vId,
                        channel: channelName
                    }));
                }

                if(channelName && channelName !== '') {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHANNEL_SYNC', name: channelName }));
                }
            }

            const skipBtn = document.querySelector('.ytp-ad-skip-button') || document.querySelector('.ytp-skip-ad-button');
            if (skipBtn) skipBtn.click();
            
            const adShowing = document.querySelector('.ad-showing');
            const vidElement = document.querySelector('video');
            if (adShowing && vidElement) vidElement.playbackRate = 16.0;

            const reels = document.querySelectorAll('ytm-reel-video-renderer');
            for (let i = 0; i < reels.length; i++) {
                const reel = reels[i];
                const textContent = reel.innerText || reel.textContent || "";
                const hasAdBadge = reel.querySelector('ytm-ad-slot-renderer, [is-ad], .brand-info') !== null;
                const hasAdKeyword = /sponsored|প্রযোজিত|ad|promoted|advertisement/i.test(textContent.toLowerCase());

                if (hasAdBadge || hasAdKeyword) {
                    const rect = reel.getBoundingClientRect();
                    if (rect.top > -200 && rect.top < window.innerHeight) {
                        window.ReactNativeWebView.postMessage('SKIP_START');
                        const v = reel.querySelector('video');
                        if (v) { v.src = ''; v.remove(); }
                        reel.style.opacity = '0';
                        reel.style.display = 'none';
                        const nextReel = reels[i + 1];
                        if (nextReel) nextReel.scrollIntoView({ behavior: 'auto', block: 'start' });
                        setTimeout(() => { reel.remove(); window.ReactNativeWebView.postMessage('SKIP_END'); }, 300);
                    }
                }
            }
        }, 250); 
    })();
    true;
  `;

  const checkSubscription = async (name) => {
    try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        const parsedSubs = subs ? JSON.parse(subs) : [];
        setCurrentChannel({ name: name, isSubscribed: parsedSubs.some(s => s.name === name) });
    } catch(e){}
  };

  const fetchDirectUrlAndCache = async (vId, channel) => {
    try {
        if (cachedShorts.some(c => c.videoId === vId)) return; 

        const apiUrl = `${MY_API_SERVER}/api/fast-play?url=https://www.youtube.com/watch?v=${vId}&quality=360&type=video`;
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
                    setCachedShorts(prev => {
                        const updated = [newShort, ...prev];
                        if(updated.length > 20) { 
                            const removed = updated.pop();
                            FileSystem.deleteAsync(removed.uri, {idempotent: true}).catch(()=>{});
                        }
                        AsyncStorage.setItem('cached_shorts', JSON.stringify(updated));
                        return updated;
                    });
                }
            }
        }
    } catch(e) {}
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
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;if (isOffline) {
      return (
          <SafeAreaView style={styles.container}>
              <View style={styles.offlineHeader}>
                  <TouchableOpacity onPress={() => { setIsOffline(false); navigation.goBack(); }} style={styles.headerIconBtn}>
                      <Ionicons name="arrow-back" size={28} color="#FFF" />
                  </TouchableOpacity>
                  <Text style={styles.offlineHeaderText}>Offline Shorts</Text>
              </View>

              {cachedShorts.length > 0 ? (
                  <FlatList
                      data={cachedShorts}
                      keyExtractor={item => item.id}
                      pagingEnabled
                      showsVerticalScrollIndicator={false}
                      onViewableItemsChanged={onViewableItemsChanged}
                      viewabilityConfig={viewabilityConfig}
                      renderItem={({item, index}) => (
                          <View style={{ width: width, height: height }}>
                              <Video 
                                  source={{ uri: item.uri }} 
                                  style={StyleSheet.absoluteFill} 
                                  shouldPlay={index === visibleIndex} 
                                  isLooping 
                                  resizeMode="cover" 
                              />
                              <View style={styles.offlineActionRow}>
                                  <Text style={styles.offlineChannelName}>@{item.channel || 'Shorts'}</Text>
                                  <View style={styles.offlineBadge}>
                                      <Ionicons name="cloud-offline" size={14} color="#FFF" />
                                      <Text style={styles.offlineBadgeText}>Cached Video</Text>
                                  </View>
                              </View>
                          </View>
                      )}
                  />
              ) : (
                  <View style={styles.offlineEmpty}>
                      <Ionicons name="wifi-outline" size={80} color="#444" />
                      <Text style={styles.offlineEmptyText}>আপনি এখন অফলাইনে আছেন</Text>
                      <Text style={styles.offlineEmptySub}>ইন্টারনেট সংযোগ চালু করে আবার চেষ্টা করুন</Text>
                      <TouchableOpacity style={styles.retryBtn} onPress={() => setIsOffline(false)}>
                          <Text style={styles.retryText}>রিলোড করুন</Text>
                      </TouchableOpacity>
                  </View>
              )}
          </SafeAreaView>
      );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={shortsWebViewRef} 
        source={{ uri: targetUri }} 
        userAgent={STABLE_USER_AGENT} 
        injectedJavaScript={shortsInjectScript} 
        onMessage={onShortsMessage} 
        onLoadEnd={() => setShortsLoading(false)} 
        javaScriptEnabled={true} 

        onError={(e) => {
            if (e.nativeEvent.code === -2 || String(e.nativeEvent.description).includes('DISCONNECTED')) {
                setIsOffline(true);
            }
        }}

        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        domStorageEnabled={true}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        containerStyle={{ flex: 1 }} 
      />
      
      <View style={styles.bottomLayer} {...panResponder.panHandlers} />
      <View style={styles.rightMiddleLayer} {...panResponder.panHandlers} />
      <View style={styles.topRightLayer} {...panResponder.panHandlers} />
      <View style={styles.topLeftLayer} {...panResponder.panHandlers} />

      {showActionBtns && currentChannel.name !== '' && currentChannel.name !== 'Unknown Channel' && (
        <View style={styles.actionRowContainer} pointerEvents="box-none">
            <TouchableOpacity 
              style={[styles.nativeSubBtn, currentChannel.isSubscribed && styles.nativeSubbedBtn]} 
              onPress={handleNativeSubscribe} activeOpacity={0.8}
            >
              <Text style={[styles.nativeSubText, currentChannel.isSubscribed && styles.nativeSubbedText]}>
                {currentChannel.isSubscribed ? 'Subscribed' : 'Subscribe'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.nativeShareBtn} onPress={handleShare} activeOpacity={0.8}>
              <Ionicons name="arrow-redo-outline" size={18} color="#FFF" />
              <Text style={styles.nativeShareText}>Share</Text>
            </TouchableOpacity>
        </View>
      )}

      {showUnmuteBtn && (
        <TouchableOpacity activeOpacity={0.8} style={styles.unmuteBadge} onPress={handleUnmutePress}>
          <Ionicons name="volume-mute" size={18} color="#FFF" />
          <Text style={styles.unmuteText}>Unmute</Text>
        </TouchableOpacity>
      )}

      {isAutoSkipping && (
        <View style={styles.skipOverlay}>
          <ActivityIndicator size="large" color="#FF0000" />
          <Text style={styles.skipText}>অ্যাড ফিল্টার হচ্ছে...</Text>
        </View>
      )}
      
      {shortsLoading && !isAutoSkipping && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FF0000" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  skipOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  skipText: { color: '#FFF', marginTop: 15, fontWeight: 'bold' },
  
  bottomLayer: { position: 'absolute', bottom: 0, left: 0, width: '100%', height: height / 3, backgroundColor: 'transparent', zIndex: 5 },
  rightMiddleLayer: { position: 'absolute', top: height / 4, right: 0, width: width / 4, height: height / 2, backgroundColor: 'transparent', zIndex: 5 },
  topRightLayer: { position: 'absolute', top: 0, right: 0, width: width / 4, height: height / 10, backgroundColor: 'transparent', zIndex: 5 },
  topLeftLayer: { position: 'absolute', top: 0, left: 0, width: width / 2, height: height / 8, backgroundColor: 'transparent', zIndex: 5 },
  
  actionRowContainer: { position: 'absolute', bottom: height / 5, left: 15, flexDirection: 'row', alignItems: 'center', zIndex: 99999, elevation: 100 },
  nativeSubBtn: { backgroundColor: '#FF0000', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nativeSubbedBtn: { backgroundColor: '#333', borderColor: '#555' },
  nativeSubText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  nativeSubbedText: { color: '#AAA' },
  nativeShareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 25, marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nativeShareText: { color: '#FFF', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  unmuteBadge: { position: 'absolute', top: 50, right: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 0, 0, 0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', zIndex: 99999 },

  offlineHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, position: 'absolute', top: 0, zIndex: 10, width: '100%', backgroundColor: 'rgba(0,0,0,0.4)' },
  headerIconBtn: { paddingRight: 10 },
  offlineHeaderText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  offlineActionRow: { position: 'absolute', bottom: 100, left: 15 },
  offlineChannelName: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,191,165,0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginTop: 8, alignSelf: 'flex-start' },
  offlineBadgeText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  offlineEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F0F' },
  offlineEmptyText: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 15 },
  offlineEmptySub: { color: '#888', fontSize: 14, marginTop: 5, marginBottom: 20 },
  retryBtn: { backgroundColor: '#00BFA5', paddingHorizontal: 25, paddingVertical: 12, borderRadius: 25 },
  retryText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});