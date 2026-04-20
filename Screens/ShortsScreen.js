import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Share } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useIsFocused } from '@react-navigation/native';

// ডিফল্ট এবং বিভিন্ন কোয়ালিটির ইউজার এজেন্ট
const HIGH_QUALITY_UA = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"; // লেটেস্ট ফোন (High Quality)
const LOW_QUALITY_UA = "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.181 Mobile Safari/537.36"; // পুরনো ফোন (Low Quality/Data Saver)

export default function ShortsScreen({ initialVideoId, route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused(); // সেটিংস থেকে ফিরে এলে যেন আপডেট হয়
  
  const [isAutoSkipping, setIsAutoSkipping] = useState(false);
  const [shortsLoading, setShortsLoading] = useState(true);
  
  const [showUnmuteBtn, setShowUnmuteBtn] = useState(false);
  const [showActionBtns, setShowActionBtns] = useState(false);
  
  // ডাইনামিক ইউজার এজেন্ট স্টেট
  const [deviceUserAgent, setDeviceUserAgent] = useState(HIGH_QUALITY_UA);
  
  const videoId = initialVideoId || route?.params?.videoId || '';
  const [currentUrl, setCurrentUrl] = useState(`https://m.youtube.com/shorts/${videoId}`);
  const [currentChannel, setCurrentChannel] = useState({ name: 'Unknown Channel', isSubscribed: false });
  
  const subscribeTimerRef = useRef(null);
  const currentChannelNameRef = useRef(''); 
  const shortsWebViewRef = useRef(null);

  const targetUri = videoId ? `https://m.youtube.com/shorts/${videoId}` : `https://m.youtube.com/shorts`;

  // সেটিংস থেকে কোয়ালিটি চেক করে মোবাইলের সুরত (User-Agent) পরিবর্তন করার লজিক
  useEffect(() => {
    const fetchQualitySettings = async () => {
      try {
        const savedQuality = await AsyncStorage.getItem('videoQuality'); // সেটিং স্ক্রিন থেকে সেভ করা ভ্যালু
        if (savedQuality === 'low') {
          setDeviceUserAgent(LOW_QUALITY_UA); // ডেটা বাঁচাতে পুরনো মোবাইলের সুরত
        } else {
          setDeviceUserAgent(HIGH_QUALITY_UA); // ভালো কোয়ালিটির জন্য লেটেস্ট মোবাইলের সুরত
        }
      } catch(e) {
        setDeviceUserAgent(HIGH_QUALITY_UA);
      }
    };
    
    if(isFocused) {
      fetchQualitySettings();
    }
  }, [isFocused]);

  const restartActionTimer = () => {
    setShowActionBtns(false);
    if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
    subscribeTimerRef.current = setTimeout(() => {
      setShowActionBtns(true);
    }, 15000); 
  };

  useEffect(() => {
    setShortsLoading(true);
    setShowUnmuteBtn(false);
    
    const timerLoading = setTimeout(() => setShortsLoading(false), 2000);
    const timerUnmute = setTimeout(() => setShowUnmuteBtn(true), 10000); 
    
    restartActionTimer();

    return () => { 
      clearTimeout(timerLoading); 
      clearTimeout(timerUnmute); 
      if (subscribeTimerRef.current) clearTimeout(subscribeTimerRef.current);
    };
  }, [targetUri]);

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
        try {
            var video = document.querySelector('video');
            if(video) { video.muted = false; video.play().catch(function(e){}); }
            var unmuteBtn = document.querySelector('.ytp-unmute, .ytm-unmute, button[aria-label*="unmute"]');
            if (unmuteBtn) { unmuteBtn.click(); }
        } catch(e) {}
        true;
      `);
      setShowUnmuteBtn(false); 
    }
  };

  // ক্র্যাশ-প্রুফ ইনজেক্টেড স্ক্রিপ্ট (কোনো লেয়ার বা অবাঞ্ছিত বাটন নেই)
  const shortsInjectScript = `
    (function() {
        try {
            var css = 'ytm-mobile-topbar-renderer, ytm-pivot-bar-renderer, header, .ytm-bottom-sheet { display: none !important; } ' +
                      'ytm-reel-player-overlay-actions, .reel-player-overlay-actions, ytm-like-button-renderer, ' +
                      'ytm-dislike-button-renderer, ytm-comment-button-renderer, ytm-share-button-renderer, ' +
                      'ytm-remix-button-renderer, [aria-label*="Like"], [aria-label*="Comment"], [aria-label*="Share"], ' +
                      '[aria-label*="লাইক"], [aria-label*="কমেন্ট"] ' +
                      '{ display: none !important; opacity: 0 !important; width: 0 !important; height: 0 !important; visibility: hidden !important; pointer-events: none !important; }';
            
            var head = document.head || document.getElementsByTagName('head')[0];
            var style = document.createElement('style');
            style.type = 'text/css';
            style.appendChild(document.createTextNode(css));
            head.appendChild(style);
        } catch(e) {}

        setInterval(function() {
            try {
                var actionBars = document.querySelectorAll('ytm-reel-player-overlay-actions, .reel-player-overlay-actions, ytm-like-button-renderer');
                for (var i = 0; i < actionBars.length; i++) {
                    if(actionBars[i]) {
                        actionBars[i].style.setProperty('display', 'none', 'important');
                        actionBars[i].style.setProperty('opacity', '0', 'important');
                        actionBars[i].style.setProperty('pointer-events', 'none', 'important');
                        if (actionBars[i].parentElement) {
                            actionBars[i].parentElement.style.setProperty('display', 'none', 'important');
                        }
                    }
                }

                var skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button');
                if (skipBtn) skipBtn.click();
                
                var adShowing = document.querySelector('.ad-showing');
                var vidElement = document.querySelector('video');
                if (adShowing && vidElement) vidElement.playbackRate = 16.0;

                var activeReel = document.querySelector('ytm-reel-video-renderer[is-active]');
                if (activeReel && window.ReactNativeWebView) {
                    var linkElem = activeReel.querySelector('a[href^="/@"]');
                    if (linkElem) {
                        var channelName = linkElem.getAttribute('href').split('?')[0].replace('/', '');
                        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHANNEL_SYNC', name: channelName }));
                    }
                }
            } catch(err) {}
        }, 200); 
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

  const onShortsMessage = async (event) => {
    const rawData = event.nativeEvent.data;
    if (rawData === "SKIP_START") setIsAutoSkipping(true);
    else if (rawData === "SKIP_END") setIsAutoSkipping(false);
    else {
        try {
          const data = JSON.parse(rawData);
          
          if (data.type === 'NEW_VIDEO_STARTED') {
              if (data.url) setCurrentUrl(data.url); 
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

  return (
    <View style={styles.container}>
      <WebView
        key="nuked-webview-v2"
        ref={shortsWebViewRef} 
        source={{ uri: targetUri }} 
        userAgent={deviceUserAgent} /* ডাইনামিক ইউজার এজেন্ট যুক্ত করা হয়েছে */
        injectedJavaScript={shortsInjectScript} 
        onMessage={onShortsMessage} 
        onLoadEnd={() => setShortsLoading(false)} 
        javaScriptEnabled={true} 
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        containerStyle={{ flex: 1 }} 
      />
      
      {/* অপ্রয়োজনীয় PanResponder এবং অদৃশ্য লেয়ারগুলো পুরোপুরি রিমুভ করা হয়েছে */}

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

// স্টাইলশীট থেকে অপ্রয়োজনীয় লেয়ারগুলোর কোড মুছে ফেলা হয়েছে
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  skipOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  skipText: { color: '#FFF', marginTop: 15, fontWeight: 'bold' },
  
  actionRowContainer: { position: 'absolute', bottom: "20%", left: 15, flexDirection: 'row', alignItems: 'center', zIndex: 99999, elevation: 100 },
  nativeSubBtn: { backgroundColor: '#FF0000', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nativeSubbedBtn: { backgroundColor: '#333', borderColor: '#555' },
  nativeSubText: { color: '#FFF', fontWeight: 'bold', fontSize: 13 },
  nativeSubbedText: { color: '#AAA' },
  nativeShareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 25, marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  nativeShareText: { color: '#FFF', fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  unmuteBadge: { position: 'absolute', top: 50, right: 15, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 0, 0, 0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', zIndex: 99999 }
});