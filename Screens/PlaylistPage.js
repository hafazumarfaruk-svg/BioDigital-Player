import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar } from 'react-native';
//import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

// --- আপনার কপি করা Raw লিংকটি নিচের কোটেশনের ভেতরে পেস্ট করুন ---
const REMOTE_ENGINE_URL = "https://gist.githubusercontent.com/hafazumarfaruk-svg/2d3deb4c65af209a4d4a0ee0c09765f9/raw/yt_engine.js";

export default function PlaylistPage({ route, navigation }) {
  const { videoId, videoData = {}, playlist = [] } = route?.params || {};
  const [videoUrl, setVideoUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [injectedJS, setInjectedJS] = useState(""); // গিটহাবের কোড এখানে লোড হবে
  const [recommendedVideos, setRecommendedVideos] = useState([]);
  const webViewRef = useRef(null);
  
  const isAntiDataSaver = global.appQuality.isAntiDataSaver;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // ১. অ্যাপের ইঞ্জিন লোড করা (গিটহাব থেকে)
  useEffect(() => {
    const fetchRemoteEngine = async () => {
      try {
        const response = await fetch(REMOTE_ENGINE_URL);
        const script = await response.text();
        if (script.length > 50) { // কোডটি সফলভাবে আসলে সেট করবে
          setInjectedJS(script);
          console.log("[System] Playlist Engine Loaded.");
        }
      } catch (error) {
        console.error("[Error] Script loading failed.");
        // ইন্টারনেট না থাকলে লোকাল ব্যাকআপ
        setInjectedJS(`true;`);
      }
    };
    fetchRemoteEngine();
  }, []);

  // ২. ভিডিও পরিবর্তন হলে সব রিসেট করা
  useEffect(() => {
    setVideoUrl(null);
    setLoadingUrl(true);
    fetchRecommendations();
  }, [videoId]);

  const fetchRecommendations = async () => {
    try {
      const query = videoData.title ? videoData.title.split(' ')[0] : 'news';
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      const htmlText = await response.text();
      const match = htmlText.match(/var ytInitialData = (.*?);<\/script>/);
      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extracted = [];
        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer && node.videoRenderer.videoId) {
              const vid = node.videoRenderer;
              extracted.push({ 
                id: vid.videoId, 
                title: vid.title?.runs?.[0]?.text, 
                channel: vid.ownerText?.runs?.[0]?.text || 'Channel', 
                views: vid.viewCountText?.simpleText, 
                thumbnail: vid.thumbnail?.thumbnails?.[0]?.url 
              });
            } else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);
        setRecommendedVideos(extracted.slice(1, 15));
      }
    } catch (e) { console.log(e); }
  };

  // ৩. রিমোট ইঞ্জিন থেকে আসা ভিডিও লিংক ধরা
  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'VIDEO_LINK' && data.url && !videoUrl) {
        setVideoUrl(data.url);
        setLoadingUrl(false);
        if(webViewRef.current) webViewRef.current.stopLoading();
      }
    } catch (e) {
      if (event.nativeEvent.data.includes('/videoplayback') && !videoUrl) {
        setVideoUrl(event.nativeEvent.data);
        setLoadingUrl(false);
      }
    }
  };

  return (
    <View style={styles.singleContainer}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      
      <View style={styles.videoPlayerWrapper}>
        <TouchableOpacity style={styles.floatingBackBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-down" size={30} color="#FFF" />
        </TouchableOpacity>

        {loadingUrl ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={{color: '#888', marginTop: 15, fontSize: 12}}>Loading Playlist Engine...</Text>
          </View>
        ) : videoUrl ? (
          <Video 
            source={{ 
              uri: videoUrl,
              headers: { 'User-Agent': 'Mozilla/5.0' } 
            }} 
            style={styles.singleVideo} 
            useNativeControls 
            resizeMode="contain" 
            shouldPlay 
          />
        ) : null}

        {/* অদৃশ্য ইঞ্জিন: এটি গিটহাব থেকে ডাউনলোড হওয়া injectedJS ব্যবহার করে */}
        {!videoUrl && injectedJS !== "" && (
          <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}>
            <WebView 
              ref={webViewRef}
              source={{ uri: `https://m.youtube.com/watch?v=${videoId}` }}
              userAgent="Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"
              injectedJavaScript={injectedJS}
              onMessage={handleMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mediaPlaybackRequiresUserAction={false}
            />
          </View>
        )}
      </View>

      <FlatList 
        data={recommendedVideos} 
        keyExtractor={(item, index) => item.id + index} 
        renderItem={({item}) => (
          <TouchableOpacity 
            style={styles.recVideoCard} 
            onPress={() => navigation.push('Playlist', { videoId: item.id, videoData: item, playlist: recommendedVideos })}
          >
            <Image source={{ uri: item.thumbnail }} style={styles.recThumbnailImage} />
            <View style={styles.recVideoInfo}>
              <Text style={styles.recVideoTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.recVideoMeta}>{item.channel} • {item.views}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListHeaderComponent={() => (
          <View style={styles.detailsContainer}>
            <Text style={styles.videoMainTitle}>{videoData.title || "Playlist Video"}</Text>
            <Text style={styles.videoMainMeta}>{videoData.views || ""} • Deciphered via Remote Engine</Text>
            
            {/* অ্যাকশন বাটনসমূহ */}
            <View style={styles.actionRow}>
               <TouchableOpacity style={styles.actionBtn}>
                  <Ionicons name="thumbs-up-outline" size={22} color="#FFF" />
                  <Text style={styles.actionText}>Like</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.actionBtn}>
                  <Ionicons name="share-social-outline" size={22} color="#FFF" />
                  <Text style={styles.actionText}>Share</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.actionBtn}>
                  <Ionicons name="download-outline" size={22} color="#FF0000" />
                  <Text style={[styles.actionText, {color: '#FF0000'}]}>Download</Text>
               </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  singleContainer: { flex: 1, backgroundColor: '#0F0F0F' },
  videoPlayerWrapper: { width: '100%', height: 230, backgroundColor: '#000', justifyContent: 'center' },
  singleVideo: { width: '100%', height: '100%' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  floatingBackBtn: { position: 'absolute', top: 10, left: 10, zIndex: 20, padding: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  detailsContainer: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  videoMainTitle: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  videoMainMeta: { color: '#AAA', fontSize: 12, marginTop: 5 },
  actionRow: { flexDirection: 'row', marginTop: 20, justifyContent: 'space-around' },
  actionBtn: { alignItems: 'center' },
  actionText: { color: '#FFF', fontSize: 10, marginTop: 5 },
  recVideoCard: { flexDirection: 'row', padding: 10 },
  recThumbnailImage: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
  recVideoInfo: { flex: 1, marginLeft: 12 },
  recVideoTitle: { color: '#FFF', fontSize: 14, lineHeight: 18 },
  recVideoMeta: { color: '#AAA', fontSize: 11, marginTop: 4 },
});