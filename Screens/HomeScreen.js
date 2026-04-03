import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, TextInput, ActivityIndicator, Platform, Keyboard, Dimensions, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import * as NavigationBar from 'expo-navigation-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SettingsScreen from '../Settings/SettingsScreen';
import ShortsScreen from './ShortsScreen'; 

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FEED_TOPICS = [ "trending bangladesh", "bangla natok 2026", "bangla new song", "somoy tv live", "cricket highlights", "bangla waz short", "bengali vlog", "bangla news today" ];

global.aiMemory = global.aiMemory || {};
global.seenVideoIds = global.seenVideoIds || new Set(); 

const { width } = Dimensions.get('window');

export default function HomeScreen({ route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [miniVideo, setMiniVideo] = useState(null);

  const [activeTab, setActiveTab] = useState('Home');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShortId, setSelectedShortId] = useState(null);

  const [subscribedChannels, setSubscribedChannels] = useState([]);
  const [thumbQuality, setThumbQuality] = useState('High');
  const [activeQuery, setActiveQuery] = useState('');

  // --- UPDATED: সাবস্ক্রাইব করা চ্যানেলের ভিডিওর হার ১০% এ নামিয়ে দেওয়া হয়েছে ---
  const getAlgorithmicTopic = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const parsedSubs = subs ? JSON.parse(subs) : [];

      const suffixes = ["", "today", "new", "2026", "latest"];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

      // মাত্র ১০% (0.10) সম্ভাবনায় সাবস্ক্রাইব করা চ্যানেল থেকে ভিডিও খুঁজবে
      if (parsedSubs.length > 0 && Math.random() < 0.10) {
          const randomSub = parsedSubs[Math.floor(Math.random() * parsedSubs.length)].name;
          const subQueries = [`${randomSub} latest`, `${randomSub} related`, randomSub];
          const selectedSubQuery = subQueries[Math.floor(Math.random() * subQueries.length)];
          return `${selectedSubQuery} ${suffix}`.trim();
      }

      // বাকি ৯০% সময় সাধারণ ট্রেন্ডিং ফিড (ভ্যারাইটি বজায় রাখতে)
      const randomTopic = FEED_TOPICS[Math.floor(Math.random() * FEED_TOPICS.length)];
      return `${randomTopic} ${suffix}`.trim();
    } catch (e) {
      console.log(e);
    }
    return FEED_TOPICS[Math.floor(Math.random() * FEED_TOPICS.length)];
  };

  useEffect(() => {
    const loadGlobalData = async () => {
      try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        if (subs) {
            setSubscribedChannels(JSON.parse(subs));
        }
        const quality = await AsyncStorage.getItem('thumbnailQuality');
        if (quality) setThumbQuality(quality);

        if (!activeQuery) {
            const initialTopic = await getAlgorithmicTopic();
            setActiveQuery(initialTopic);
        }
      } catch (e) {}
    };
    if (isFocused) {
      loadGlobalData();
      if (global.playerBridge?.videoId) setMiniVideo({ ...global.playerBridge });
    }
  }, [isFocused]);

  useEffect(() => {
    if (route?.params?.executeSearch) {
        setActiveTab('Home'); setSearchQuery(route.params.executeSearch); setActiveQuery(route.params.executeSearch);
    }
    if (route?.params?.targetTab) setActiveTab(route.params.targetTab);
  }, [route?.params]);

  useEffect(() => {
    if (activeQuery) {
        fetchRealVideos(activeQuery, true);
    }
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden");
  }, [activeQuery]);

  useEffect(() => {
    const intervalId = setInterval(async () => {
        const newTopic = await getAlgorithmicTopic();
        setActiveQuery(newTopic);
    }, 10 * 60 * 1000); 
    return () => clearInterval(intervalId);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    const newTopic = await getAlgorithmicTopic();
    setActiveQuery(newTopic);
  };

  const loadMoreVideos = async () => {
    if (isFetchingMore || loading) return; 
    setIsFetchingMore(true);
    
    const nextQuery = await getAlgorithmicTopic();
    await fetchRealVideos(nextQuery, false); 
    
    setIsFetchingMore(false);
  };

  const getHighQualityThumbnail = (thumbnailObj, videoId) => {
    if (thumbQuality === 'Data Saver' && videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`; 
    if (!thumbnailObj || !thumbnailObj.thumbnails || thumbnailObj.thumbnails.length === 0) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let bestImgUrl = thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url;
    return bestImgUrl.startsWith('//') ? 'https:' + bestImgUrl : bestImgUrl;
  };

  const getVerticalShortsThumbnail = (videoId) => {
    return `https://i.ytimg.com/vi/${videoId}/oardefault.jpg`;
  };

  const fetchRealVideos = async (query, isNewSearch = false, retryCount = 0) => {
    if (isNewSearch && retryCount === 0) { setLoading(true); } 
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': DESKTOP_AGENT, 'Accept-Language': 'en-US,en;q=0.9' }
      });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);
      
      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        
        const extractedVideos = [];
        const extractedShorts = [];
        
        // --- UPDATED: শর্টস চেনার নতুন পদ্ধতি (শুধুমাত্র @ এবং Short টেক্সট) ---
        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                const channelName = node.videoRenderer.ownerText?.runs?.[0]?.text || node.videoRenderer.longBylineText?.runs?.[0]?.text || '';
                const titleText = node.videoRenderer.title?.runs?.[0]?.text?.toLowerCase() || '';
                
                // শর্ত ১: চ্যানেলের নাম @ দিয়ে শুরু হয়েছে কিনা
                const isAtHandle = channelName.trim().startsWith('@');
                // শর্ত ২: টাইটেলে short বা শর্ট লেখা আছে কিনা
                const hasShortText = titleText.includes('short') || titleText.includes('শর্ট');
                
                if (isAtHandle || hasShortText) {
                    extractedShorts.push({
                        videoId: node.videoRenderer.videoId,
                        headline: { simpleText: node.videoRenderer.title?.runs?.[0]?.text },
                        viewCountText: { simpleText: node.videoRenderer.shortViewCountText?.simpleText || node.videoRenderer.viewCountText?.simpleText }
                    });
                } else {
                    extractedVideos.push(node.videoRenderer);
                }
            }
            else if (node.reelItemRenderer) {
                // ডিফল্ট ইউটিউব শর্টস শেলফ
                extractedShorts.push(node.reelItemRenderer);
            }
            else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);
        
        const freshVideos = extractedVideos.filter(vid => {
            if (global.seenVideoIds.has(vid.videoId)) return false;
            global.seenVideoIds.add(vid.videoId);
            return true;
        });

        const freshShorts = extractedShorts.filter(short => {
            if (global.seenVideoIds.has(short.videoId)) return false;
            global.seenVideoIds.add(short.videoId);
            return true;
        });

        if (global.seenVideoIds.size > 1000) {
            const iterator = global.seenVideoIds.values();
            for (let i = 0; i < 200; i++) global.seenVideoIds.delete(iterator.next().value);
        }

        const formattedVideos = freshVideos.map(vid => ({
            id: vid.videoId, title: vid.title?.runs?.[0]?.text || 'No Title', channel: vid.ownerText?.runs?.[0]?.text || vid.longBylineText?.runs?.[0]?.text || 'Channel',
            views: vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || 'N/A', 
            duration: vid.lengthText?.simpleText || '', publishedTime: vid.publishedTimeText?.simpleText || '',
            thumbnail: getHighQualityThumbnail(vid.thumbnail, vid.videoId), 
            avatar: getHighQualityThumbnail(vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail, null),
            type: 'video'
        }));

        const formattedShorts = freshShorts.map(short => ({
            id: short.videoId,
            title: short.headline?.simpleText || 'Short Video',
            views: short.viewCountText?.simpleText || 'N/A',
            thumbnail: getVerticalShortsThumbnail(short.videoId),
            type: 'short'
        }));

        let combinedFeed = formattedVideos;

        // --- UPDATED: শর্টসগুলোকে একদম সর্বপ্রথমে (Top of the list) দেখানো হবে ---
        if (formattedShorts.length > 0) {
            const uniqueShorts = formattedShorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
            // splice(0, 0) ব্যবহার করে একদম প্রথমে (Index 0) বসানো হলো
            combinedFeed.splice(0, 0, { id: 'shelf_' + Date.now() + Math.random(), type: 'shorts_shelf', shorts: uniqueShorts });
        }

        if (combinedFeed.length === 0 && isNewSearch && retryCount < 3) {
            const fallbackQuery = await getAlgorithmicTopic();
            return fetchRealVideos(fallbackQuery, true, retryCount + 1);
        }

        setVideos(isNewSearch ? combinedFeed : [...videos, ...combinedFeed]);
      }
    } catch (e) {} finally { setLoading(false); setRefreshing(false); }
  };

  const toggleSubscription = async (channelName, avatarUrl) => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      subs = subs ? JSON.parse(subs) : [];
      const isSubbed = subs.some(s => s.name === channelName);
      if (isSubbed) {
        subs = subs.filter(s => s.name !== channelName);
      } else {
        subs.push({ id: Date.now().toString(), name: channelName, avatar: avatarUrl });
      }
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setSubscribedChannels(subs);
    } catch (e) {}
  };

  const handleVideoPress = (item) => navigation.navigate('Player', { videoId: item.id, videoData: item });
  const handleChannelPress = (item) => navigation.navigate('Channel', { channelData: item });

  const renderVideoItem = ({ item }) => {
    if (item.type === 'shorts_shelf') {
      return (
        <View style={styles.shortsShelfContainer}>
          <View style={styles.shortsShelfHeader}>
            <Image source={{uri: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/YouTube_play_buttom_icon_%282013-2017%29.svg'}} style={{width: 24, height: 24, tintColor: '#FF0000'}} />
            <Text style={styles.shortsShelfTitle}>Shorts</Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={item.shorts}
            keyExtractor={(s, index) => s.id + index.toString()}
            contentContainerStyle={{ paddingHorizontal: 12 }}
            renderItem={({item: short}) => (
              <TouchableOpacity 
                style={styles.shortItemCard} 
                activeOpacity={0.9} 
                onPress={() => {
                  setSelectedShortId(short.id);
                  setActiveTab('Shorts');
                }}
              >
                <Image source={{ uri: short.thumbnail }} style={styles.shortThumbnailImage} />
                <View style={styles.shortTextOverlay}>
                  <Text style={styles.shortTitleText} numberOfLines={2}>{short.title}</Text>
                  <Text style={styles.shortViewsText}>{short.views}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      );
    }

    const isSubscribed = subscribedChannels.some(sub => sub.name === item.channel);
    return (
      <View style={styles.videoCard}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => handleVideoPress(item)}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          {item.duration ? <View style={styles.durationBadge}><Text style={styles.durationText}>{item.duration}</Text></View> : null}
        </TouchableOpacity>
        
        <View style={styles.videoInfo}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => handleChannelPress(item)}>
            <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
          </TouchableOpacity>
          
          <View style={styles.textContainer}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => handleVideoPress(item)}>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.8} onPress={() => handleChannelPress(item)}>
              <Text style={styles.meta}>{item.channel} • {item.views} {item.publishedTime ? `• ${item.publishedTime}` : ''}</Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={[styles.nativeSubBtn, isSubscribed && styles.nativeSubbedBtn]} onPress={() => toggleSubscription(item.channel, item.avatar)}>
            <Text style={[styles.nativeSubText, isSubscribed && styles.nativeSubbedText]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const MiniPlayer = () => {
    if (!miniVideo || !miniVideo.videoId) return null;
    return (
      <TouchableOpacity style={styles.miniPlayerContainer} activeOpacity={1} onPress={() => navigation.navigate('Player', { videoId: miniVideo.videoId, videoData: miniVideo.videoData })}>
        <View style={styles.miniPlayerContent}>
          <Image source={{ uri: miniVideo.videoData?.thumbnail || `https://i.ytimg.com/vi/${miniVideo.videoId}/hqdefault.jpg` }} style={styles.miniPlayerImage} />
          <View style={styles.miniPlayerTextContainer}>
            <Text style={styles.miniPlayerTitle} numberOfLines={1}>{miniVideo.videoData?.title || 'Unknown Title'}</Text>
            <Text style={styles.miniPlayerSubTitle} numberOfLines={1}>{miniVideo.videoData?.channel || 'Unknown Channel'}</Text>
          </View>
          <TouchableOpacity style={styles.miniPlayerClose} onPress={() => { global.playerBridge = { videoId: null, videoData: null, currentTime: 0 }; setMiniVideo(null); }}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const MeMenuItem = ({ icon, text, onPress }) => (
    <TouchableOpacity style={styles.meMenuItem} onPress={onPress}>
      <Ionicons name={icon} size={24} color="#00BFA5" style={styles.meMenuIcon} />
      <Text style={styles.meMenuText}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" translucent={true} />
      
      {activeTab !== 'Shorts' && activeTab !== 'ME' && activeTab !== 'Settings' && (
        <View style={styles.header}>
          <View style={styles.logoContainer}>
             <Ionicons name="logo-youtube" size={28} color="#FF0000" />
             <Text style={styles.logoText}>MyTube</Text>
          </View>
          <View style={styles.searchBar}>
            <TextInput style={styles.input} placeholder="সার্চ..." placeholderTextColor="#888" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={() => { setActiveQuery(searchQuery); Keyboard.dismiss(); }} />
            <TouchableOpacity onPress={() => { setActiveQuery(searchQuery); Keyboard.dismiss(); }}><Ionicons name="search" size={18} color="#AAA" /></TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.mainContent}>
        {activeTab === 'Home' ? (
          loading && videos.length === 0 ? ( 
            <ActivityIndicator size="large" color="#FF0000" style={{ flex: 1, justifyContent: 'center' }} /> 
          ) : (
            <FlatList 
              data={videos} 
              renderItem={renderVideoItem} 
              keyExtractor={(item, index) => item.id + index.toString()} 
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" />} 
              onEndReached={loadMoreVideos}
              onEndReachedThreshold={0.5} 
              ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color="#FF0000" style={{ marginVertical: 20 }} /> : null}
            />
          )
        ) : activeTab === 'Shorts' ? (
          <ShortsScreen initialVideoId={selectedShortId} />
        ) : activeTab === 'Settings' ? (
          <SettingsScreen />
        ) : activeTab === 'ME' ? (
          <View style={styles.meContainer}>
             <View style={styles.meHeaderProfile}>
                 <Ionicons name="person-circle" size={80} color="#555" />
                 <Text style={styles.meName}>MyTube User</Text>
                 <Text style={styles.meEmail}>Manage your account</Text>
             </View>
             <View style={styles.meMenuWrapper}>
                 <MeMenuItem icon="time-outline" text="HISTORY" onPress={() => navigation.navigate('History')} />
                 <MeMenuItem icon="download-outline" text="DOWNLOAD" onPress={() => {}} />
                 <MeMenuItem icon="notifications-outline" text="MY SUBSCRIBE" onPress={() => navigation.navigate('Subscriptions')} />
                 <MeMenuItem icon="settings-outline" text="SETTINGS" onPress={() => setActiveTab('Settings')} />
                 <MeMenuItem icon="mail-outline" text="SUPPORT TO GMAIL" onPress={() => {}} />
             </View>
          </View>
        ) : null}
      </View>

      {activeTab === 'Home' && <MiniPlayer />}

      <View style={styles.tabBar}>
        <TouchableOpacity onPress={() => setActiveTab('Home')} style={styles.tab}><Ionicons name={activeTab==='Home'?'home':'home-outline'} size={24} color={activeTab==='Home'?'#FFF':'#888'} /><Text style={[styles.tabText, activeTab==='Home' && {color:'#FFF'}]}>Home</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('Shorts')} style={styles.tab}><Ionicons name={activeTab==='Shorts'?'play-circle':'play-circle-outline'} size={24} color={activeTab==='Shorts'?'#FFF':'#888'} /><Text style={[styles.tabText, activeTab==='Shorts' && {color:'#FFF'}]}>Shorts</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('ME')} style={styles.tab}><Ionicons name={(activeTab==='ME' || activeTab==='Settings') ? 'person' : 'person-outline'} size={24} color={(activeTab==='ME' || activeTab==='Settings') ? '#FFF' : '#888'} /><Text style={[styles.tabText, (activeTab==='ME' || activeTab==='Settings') && {color:'#FFF'}]}>ME</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', width: '100%', backgroundColor: '#0F0F0F' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
  logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4, letterSpacing: -0.5 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },
  input: { flex: 1, color: '#FFF', fontSize: 14, padding: 0 },
  mainContent: { flex: 1, backgroundColor: '#0F0F0F' },
  
  videoCard: { marginBottom: 15 },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#333' },
  textContainer: { flex: 1, paddingRight: 10 },
  title: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  meta: { color: '#AAA', fontSize: 12, marginTop: 4 },
  
  shortsShelfContainer: { paddingVertical: 15, borderTopWidth: 4, borderBottomWidth: 4, borderColor: '#222', marginBottom: 15, backgroundColor: '#0F0F0F' },
  shortsShelfHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 15 },
  shortsShelfTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  shortItemCard: { width: width * 0.4, height: width * 0.7, marginRight: 12, borderRadius: 10, overflow: 'hidden', backgroundColor: '#222', position: 'relative' },
  shortThumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' }, 
  shortTextOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, paddingTop: 30, backgroundColor: 'rgba(0,0,0,0.6)' },
  shortTitleText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginBottom: 4, textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2, lineHeight: 18 },
  shortViewsText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  
  nativeSubBtn: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, marginLeft: 5 },
  nativeSubText: { color: '#000', fontSize: 12, fontWeight: 'bold' },
  nativeSubbedBtn: { backgroundColor: '#222' },
  nativeSubbedText: { color: '#FFF' },
  
  tabBar: { flexDirection: 'row', height: 60, borderTopWidth: 1, borderTopColor: '#222', backgroundColor: '#0F0F0F' },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabText: { fontSize: 10, color: '#888', marginTop: 4 },
  
  meContainer: { flex: 1, backgroundColor: '#0F0F0F' },
  meHeaderProfile: { alignItems: 'center', marginTop: 40, marginBottom: 30 },
  meName: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 10 },
  meEmail: { color: '#AAA', fontSize: 14, marginTop: 4 },
  meMenuWrapper: { paddingHorizontal: 20 },
  meMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#222' },
  meMenuIcon: { marginRight: 20 },
  meMenuText: { color: '#FFF', fontSize: 16, fontWeight: '500' },
  
  miniPlayerContainer: { position: 'absolute', bottom: 60, width: '100%', height: 60, backgroundColor: '#212121', borderBottomWidth: 1, borderBottomColor: '#333', zIndex: 100 },
  miniPlayerContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  miniPlayerImage: { width: 100, height: 60, resizeMode: 'cover', backgroundColor: '#000' },
  miniPlayerTextContainer: { flex: 1, paddingHorizontal: 10 },
  miniPlayerTitle: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  miniPlayerSubTitle: { color: '#AAA', fontSize: 11 },
  miniPlayerClose: { padding: 15 }
});