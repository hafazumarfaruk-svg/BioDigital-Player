import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
// NativeModules ইমপোর্ট করা হয়েছে
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, NativeModules } from 'react-native';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 

// কাস্টম কোটলিন মডিউলটিকে জাভাস্ক্রিপ্টে কল করার জন্য যুক্ত করা হলো
const { YtdlpModule } = NativeModules;

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

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};
  
  const [videoUrl, setVideoUrl] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null); 
  const [streamMode, setStreamMode] = useState('combined'); 

  const [loadingUrl, setLoadingUrl] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  
  const [currentQuality, setCurrentQuality] = useState('720p');
  const [actualPlayingQuality, setActualPlayingQuality] = useState('Loading...'); 

  const [captions, setCaptions] = useState([]); 
  const [selectedCC, setSelectedCC] = useState(null);
  const [showCCMenu, setShowCCMenu] = useState(false);

  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const videoPlayerRef = useRef(null);
  const audioPlayerRef = useRef(new Audio.Sound()); 
  const appliedQualityRef = useRef('720p'); 

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: true });
    return () => {
      if (audioPlayerRef.current) audioPlayerRef.current.unloadAsync();
    };
  }, []);

  useEffect(() => {
    const initializePlayer = async () => {
      setVideoUrl(null);
      setAudioUrl(null);
      setLoadingUrl(true);
      setErrorMessage(null);
      setSelectedCC(null);
      setCaptions([]);
      if (audioPlayerRef.current) await audioPlayerRef.current.unloadAsync();
      
      const savedQuality = await AsyncStorage.getItem('@normalVideoQuality') || '720p';
      appliedQualityRef.current = savedQuality;
      setCurrentQuality(savedQuality);
      
      fetchVideoFromNativeModule(savedQuality);
      fetchRelatedVideos(false);
    };
    initializePlayer();
  }, [videoId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', async () => {
      const savedQuality = await AsyncStorage.getItem('@normalVideoQuality') || '720p';
      
      if (appliedQualityRef.current !== savedQuality) {
          appliedQualityRef.current = savedQuality; 
          setCurrentQuality(savedQuality); 
          
          setVideoUrl(null); 
          setAudioUrl(null);
          if (audioPlayerRef.current) await audioPlayerRef.current.unloadAsync();
          setLoadingUrl(true);
          setActualPlayingQuality('Switching...');
          
          fetchVideoFromNativeModule(savedQuality);
      }
    });
    return unsubscribe;
  }, [navigation, videoId]);

  // HTTP Request (fetch) মুছে ফেলে সরাসরি Native Bridge কল করার লজিক
  const fetchVideoFromNativeModule = async (qualityStr) => {
    try {
      const numericQuality = getNumericQuality(qualityStr);
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // 코টলিন ফাইলে থাকা extractVideoInfo ফাংশনকে কল করা হচ্ছে
      const resultString = await YtdlpModule.extractVideoInfo(targetUrl, numericQuality.toString());
      const data = JSON.parse(resultString);

      if (data.success && data.url) {
        setStreamMode(data.streamType || 'combined');
        setVideoUrl(data.url);
        
        if(qualityStr.includes('75p') || qualityStr.includes('Anti')) {
             setActualPlayingQuality('Data Saver Mode (Lowest)');
        } else {
             setActualPlayingQuality(data.actualQuality || `${numericQuality}p`);
        }
        
        setCaptions(data.captions || []);

        if (data.streamType === 'separate' && data.audioUrl) {
            setAudioUrl(data.audioUrl);
            await audioPlayerRef.current.loadAsync({ uri: data.audioUrl });
        }
      } else {
        setErrorMessage(data.error || "লিংক বের করতে সমস্যা হয়েছে।");
      }
    } catch (error) {
      setErrorMessage(`অ্যান্ড্রয়েড নেটিভ এরর: ${error.message || "Unknown Error"}`);
    } finally {
      setLoadingUrl(false);
    }
  };

  const handleVideoPlaybackStatusUpdate = async (status) => {
    if (streamMode === 'separate' && audioPlayerRef.current && status.isLoaded) {
        const audioStatus = await audioPlayerRef.current.getStatusAsync();
        if (!audioStatus.isLoaded) return;

        if (status.isPlaying && !audioStatus.isPlaying) {
            await audioPlayerRef.current.playAsync();
        } else if (!status.isPlaying && audioStatus.isPlaying) {
            await audioPlayerRef.current.pauseAsync();
        }

        if (status.isPlaying && Math.abs(status.positionMillis - audioStatus.positionMillis) > 500) {
            await audioPlayerRef.current.setPositionAsync(status.positionMillis);
        }
    }
  };

  const fetchRelatedVideos = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    try {
      let query = videoData.channel || "trending bangla";
      if (isLoadMore && videoData.title) {
         const words = videoData.title.split(' ');
         query = words.slice(0, 3).join(' ') + " " + Math.floor(Math.random() * 100);
      }
      
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
      const htmlText = await response.text();
      const match = htmlText.match(/var ytInitialData = (.*?);<\/script>/);
      if (!match || !match[1]) return;
      
      const jsonData = JSON.parse(match[1]);
      const extractedVids = [];
      const extractNodes = (node) => {
        if (Array.isArray(node)) node.forEach(extractNodes);
        else if (node && typeof node === 'object') {
          if (node.videoRenderer && node.videoRenderer.videoId && node.videoRenderer.videoId !== videoId) {
            const vid = node.videoRenderer;
            extractedVids.push({ 
              id: vid.videoId, 
              title: vid.title?.runs?.[0]?.text, 
              channel: vid.ownerText?.runs?.[0]?.text || 'Channel', 
              views: vid.viewCountText?.simpleText, 
              thumbnail: `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`
            });
          } else Object.values(node).forEach(extractNodes);
        }
      };
      extractNodes(jsonData);
      
      if (isLoadMore) {
          setRelatedVideos(prev => [...prev, ...extractedVids.filter(v => !prev.find(p => p.id === v.id)).slice(0, 10)]);
      } else {
          setRelatedVideos(extractedVids.slice(0, 15));
      }
    } catch (e) {} finally {
      setIsLoadingMore(false);
    }
  };

  const handleCCSelect = (track) => {
    setSelectedCC(track);
    setShowCCMenu(false);
  };

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <Text style={styles.mainTitle}>{videoData?.title || "Video Title"}</Text>
      <Text style={styles.mainViews}>{videoData?.views || "N/A views"} • {actualPlayingQuality}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn}><Ionicons name="thumbs-up-outline" size={20} color="#FFF" /><Text style={styles.actionText}>Like</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}><Ionicons name="download-outline" size={20} color="#FFF" /><Text style={styles.actionText}>Download</Text></TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}><Ionicons name="share-social-outline" size={20} color="#FFF" /><Text style={styles.actionText}>Share</Text></TouchableOpacity>
      </View>
      <View style={styles.divider} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />
      
      <View style={styles.playerWrapper}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-down" size={30} color="#FFF" />
        </TouchableOpacity>

        {loadingUrl ? (
          <View style={{alignItems: 'center'}}>
             <ActivityIndicator size="large" color="#FF0000" />
             <Text style={{color: '#AAA', marginTop: 10, fontSize: 12}}>Loading {currentQuality} Video...</Text>
          </View>
        ) : errorMessage ? (
          <View style={{alignItems: 'center'}}>
            <Ionicons name="alert-circle" size={40} color="#FF4444" />
            <Text style={{color: '#FF4444', textAlign: 'center', marginTop: 10}}>{errorMessage}</Text>
          </View>
        ) : videoUrl ? (
          <Video 
            ref={videoPlayerRef}
            source={{ 
              uri: videoUrl,
              textTracks: selectedCC ? [{ title: selectedCC.label, language: selectedCC.language, type: 'text/vtt', uri: selectedCC.uri }] : []
            }} 
            style={styles.video} 
            useNativeControls 
            resizeMode="contain" 
            shouldPlay 
            isMuted={streamMode === 'separate'} 
            onPlaybackStatusUpdate={handleVideoPlaybackStatusUpdate}
            selectedTextTrack={selectedCC ? { type: "language", value: selectedCC.language } : { type: "disabled" }}
          />
        ) : null}

        {!loadingUrl && captions.length > 0 && (
          <TouchableOpacity style={styles.ccBtn} onPress={() => setShowCCMenu(!showCCMenu)}>
            <Ionicons name="subtitles" size={24} color={selectedCC ? "#3EA6FF" : "#FFF"} />
          </TouchableOpacity>
        )}
      </View>

      {showCCMenu && (
        <View style={styles.ccMenu}>
          <Text style={styles.menuTitle}>Captions / Translation</Text>
          <ScrollView>
            <TouchableOpacity style={styles.menuItem} onPress={() => handleCCSelect(null)}>
              <Text style={{color: !selectedCC ? '#3EA6FF' : '#FFF'}}>Off</Text>
            </TouchableOpacity>
            {captions.map((track, idx) => (
              <TouchableOpacity key={idx} style={styles.menuItem} onPress={() => handleCCSelect(track)}>
                <Text style={{color: selectedCC?.language === track.language ? '#3EA6FF' : '#FFF'}}>{track.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList 
        ListHeaderComponent={renderHeader}
        data={relatedVideos} 
        keyExtractor={(item, index) => item.id + index.toString()} 
        renderItem={({item}) => (
          <TouchableOpacity style={styles.recCard} onPress={() => navigation.push('Player', { videoId: item.id, videoData: item })}>
            <Image source={{ uri: item.thumbnail }} style={styles.recThumb} />
            <View style={styles.recInfo}>
              <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.recMeta}>{item.channel} • {item.views}</Text>
            </View>
          </TouchableOpacity>
        )}
        onEndReached={() => fetchRelatedVideos(true)}
        onEndReachedThreshold={0.5}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator size="large" color="#FF0000" style={{margin: 20}} /> : null}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F0F' },
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    video: { width: '100%', height: '100%' },
    backBtn: { position: 'absolute', top: 10, left: 10, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 4 },
    ccBtn: { position: 'absolute', top: 10, right: 15, zIndex: 20, padding: 5 },
    ccMenu: { position: 'absolute', top: 50, right: 10, width: 200, maxHeight: 250, backgroundColor: '#1E1E1E', borderRadius: 10, padding: 15, zIndex: 100, elevation: 10, borderWidth: 1, borderColor: '#333' },
    menuTitle: { color: '#888', fontSize: 12, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' },
    menuItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
    detailsContainer: { padding: 15 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', lineHeight: 24 },
    mainViews: { color: '#AAA', fontSize: 13, marginTop: 5, marginBottom: 15 },
    actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 10 },
    actionBtn: { alignItems: 'center', backgroundColor: '#222', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
    actionText: { color: '#FFF', fontSize: 12, marginTop: 4 },
    divider: { height: 1, backgroundColor: '#222', marginTop: 15 },
    recCard: { flexDirection: 'row', padding: 10 },
    recThumb: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    recTitle: { color: '#FFF', fontSize: 14, marginBottom: 4 },
    recMeta: { color: '#AAA', fontSize: 11 }
});