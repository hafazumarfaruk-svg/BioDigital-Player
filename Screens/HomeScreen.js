import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Platform, Dimensions, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; // ইভেন্ট এমিটার ইমপোর্ট করা হলো

import SettingsScreen from '../Settings/SettingsScreen';
import ShortsScreen from './ShortsScreen'; 

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FEED_TOPICS = [ "trending bangladesh", "bangla natok 2026", "bangla new song", "somoy tv live", "cricket highlights", "bangla waz short", "bengali vlog", "bangla news today" ];

global.seenVideoIds = global.seenVideoIds || new Set(); 
const { width } = Dimensions.get('window');

export default function HomeScreen({ route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

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

  const getAlgorithmicTopic = async () => {
    try {
      const subs = JSON.parse(await AsyncStorage.getItem('subscribedChannels') || '[]');
      const suffix = ["", "today", "new", "2026", "latest"][Math.floor(Math.random() * 5)];
      if (subs.length > 0 && Math.random() < 0.10) {
          const randomSub = subs[Math.floor(Math.random() * subs.length)].name;
          return `${[`${randomSub} latest`, `${randomSub} related`, randomSub][Math.floor(Math.random() * 3)]} ${suffix}`.trim();
      }
      return `${FEED_TOPICS[Math.floor(Math.random() * FEED_TOPICS.length)]} ${suffix}`.trim();
    } catch (e) { return FEED_TOPICS[0]; }
  };

  useEffect(() => {
    const loadGlobalData = async () => {
      try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        if (subs) setSubscribedChannels(JSON.parse(subs));
        const quality = await AsyncStorage.getItem('thumbnailQuality');
        if (quality) setThumbQuality(quality);
        if (!activeQuery) setActiveQuery(await getAlgorithmicTopic());
      } catch (e) {}
    };
    if (isFocused) loadGlobalData();
  }, [isFocused]);

  useEffect(() => {
    if (route?.params?.executeSearch) { setActiveTab('Home'); setSearchQuery(route.params.executeSearch); setActiveQuery(route.params.executeSearch); }
    if (route?.params?.targetTab) setActiveTab(route.params.targetTab);
  }, [route?.params]);

  useEffect(() => {
    if (activeQuery) fetchRealVideos(activeQuery, true);
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden");
  }, [activeQuery]);

  const handleRefresh = async () => { setRefreshing(true); setActiveQuery(await getAlgorithmicTopic()); };
  const loadMoreVideos = async () => { if (isFetchingMore || loading) return; setIsFetchingMore(true); await fetchRealVideos(await getAlgorithmicTopic(), false); setIsFetchingMore(false); };

  const fetchRealVideos = async (query, isNewSearch = false, retryCount = 0) => {
    if (isNewSearch && retryCount === 0) setLoading(true);
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const match = (await response.text()).match(/ytInitialData\s*=\s*({.+?});/) || (await response.text()).match(/var ytInitialData = (.*?);<\/script>/);
      
      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extractedVideos = []; const extractedShorts = [];
        
        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                if ((node.videoRenderer.ownerText?.runs?.[0]?.text || '').trim().startsWith('@') || (node.videoRenderer.title?.runs?.[0]?.text?.toLowerCase() || '').includes('short') || (node.videoRenderer.title?.runs?.[0]?.text?.toLowerCase() || '').includes('শর্ট')) {
                    extractedShorts.push({ videoId: node.videoRenderer.videoId, headline: { simpleText: node.videoRenderer.title?.runs?.[0]?.text }, viewCountText: { simpleText: node.videoRenderer.shortViewCountText?.simpleText } });
                } else extractedVideos.push(node.videoRenderer);
            }
            else if (node.reelItemRenderer) extractedShorts.push(node.reelItemRenderer);
            else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);
        
        const formattedVideos = extractedVideos.filter(vid => !global.seenVideoIds.has(vid.videoId) && global.seenVideoIds.add(vid.videoId)).map(vid => ({
            id: vid.videoId, title: vid.title?.runs?.[0]?.text || 'No Title', channel: vid.ownerText?.runs?.[0]?.text || 'Channel', views: vid.shortViewCountText?.simpleText || 'N/A', duration: vid.lengthText?.simpleText || '', publishedTime: vid.publishedTimeText?.simpleText || '',
            thumbnail: thumbQuality === 'Data Saver' ? `https://i.ytimg.com/vi/${vid.videoId}/mqdefault.jpg` : `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`, avatar: vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`, type: 'video'
        }));

        const formattedShorts = extractedShorts.filter(short => !global.seenVideoIds.has(short.videoId) && global.seenVideoIds.add(short.videoId)).map(short => ({
            id: short.videoId, title: short.headline?.simpleText || 'Short Video', views: short.viewCountText?.simpleText || 'N/A', thumbnail: `https://i.ytimg.com/vi/${short.videoId}/oardefault.jpg`, type: 'short'
        }));

        let combinedFeed = formattedVideos;
        if (formattedShorts.length > 0) combinedFeed.splice(0, 0, { id: 'shelf_' + Date.now(), type: 'shorts_shelf', shorts: formattedShorts.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i) });

        if (combinedFeed.length === 0 && isNewSearch && retryCount < 3) return fetchRealVideos(await getAlgorithmicTopic(), true, retryCount + 1);
        setVideos(isNewSearch ? combinedFeed : [...videos, ...combinedFeed]);
      }
    } catch (e) {} finally { setLoading(false); setRefreshing(false); }
  };

  const toggleSubscription = async (channelName, avatarUrl) => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels'); subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === channelName);
      if (exists) subs = subs.filter(s => s.name !== channelName); else subs.push({ id: Date.now().toString(), name: channelName, avatar: avatarUrl });
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs)); setSubscribedChannels(subs);
    } catch (e) {}
  };

  // ১০০% জিরো লোডিংয়ের জন্য গ্লোবাল ইভেন্ট ফায়ার করা হচ্ছে
  const handleVideoPress = (item) => {
    DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item });
    navigation.navigate('Player', { videoId: item.id, videoData: item });
  };
  
  const handleChannelPress = (item) => navigation.navigate('Channel', { channelData: item });

  const renderVideoItem = ({ item }) => {
    if (item.type === 'shorts_shelf') {
      return (
        <View style={styles.shortsShelfContainer}>
          <View style={styles.shortsShelfHeader}>
            <Image source={{uri: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/YouTube_play_buttom_icon_%282013-2017%29.svg'}} style={{width: 24, height: 24, tintColor: '#FF0000'}} /><Text style={styles.shortsShelfTitle}>Shorts</Text>
          </View>
          <FlatList horizontal showsHorizontalScrollIndicator={false} data={item.shorts} keyExtractor={(s, index) => s.id + index.toString()} contentContainerStyle={{ paddingHorizontal: 12 }}
            renderItem={({item: short}) => (
              <TouchableOpacity style={styles.shortItemCard} activeOpacity={0.9} onPress={() => { setSelectedShortId(short.id); setActiveTab('Shorts'); }}>
                <Image source={{ uri: short.thumbnail }} style={styles.shortThumbnailImage} />
                <View style={styles.shortTextOverlay}><Text style={styles.shortTitleText} numberOfLines={2}>{short.title}</Text><Text style={styles.shortViewsText}>{short.views}</Text></View>
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
          <TouchableOpacity activeOpacity={0.8} onPress={() => handleChannelPress(item)}><Image source={{ uri: item.avatar }} style={styles.channelAvatar} /></TouchableOpacity>
          <View style={styles.textContainer}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => handleVideoPress(item)}><Text style={styles.title} numberOfLines={2}>{item.title}</Text></TouchableOpacity>
            <TouchableOpacity activeOpacity={0.8} onPress={() => handleChannelPress(item)}><Text style={styles.meta}>{item.channel} • {item.views} {item.publishedTime ? `• ${item.publishedTime}` : ''}</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.nativeSubBtn, isSubscribed && styles.nativeSubbedBtn]} onPress={() => toggleSubscription(item.channel, item.avatar)}><Text style={[styles.nativeSubText, isSubscribed && styles.nativeSubbedText]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text></TouchableOpacity>
        </View>
      </View>
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
          <View style={styles.logoContainer}><Ionicons name="logo-youtube" size={28} color="#FF0000" /><Text style={styles.logoText}>MyTube</Text></View>
          
          {/* সার্চ বাটনের বাগ ഫিক্স করা হয়েছে */}
          <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('Search')}>
            <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>{searchQuery || "সার্চ..."}</Text>
            <Ionicons name="search" size={18} color="#AAA" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainContent}>
        {activeTab === 'Home' ? ( loading && videos.length === 0 ? ( <ActivityIndicator size="large" color="#FF0000" style={{ flex: 1, justifyContent: 'center' }} /> ) : (
            <FlatList data={videos} renderItem={renderVideoItem} keyExtractor={(item, index) => item.id + index.toString()} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" />} onEndReached={loadMoreVideos} onEndReachedThreshold={0.5} ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color="#FF0000" style={{ marginVertical: 20 }} /> : null} />
          )
        ) : activeTab === 'Shorts' ? ( <ShortsScreen initialVideoId={selectedShortId} />
        ) : activeTab === 'Settings' ? ( <SettingsScreen />
        ) : activeTab === 'ME' ? ( 
          <View style={styles.meContainer}>
             <View style={styles.meHeaderProfile}><Ionicons name="person-circle" size={80} color="#555" /><Text style={styles.meName}>MyTube User</Text></View>
             <View style={styles.meMenuWrapper}>
                 <MeMenuItem icon="time-outline" text="HISTORY" onPress={() => navigation.navigate('History')} />
                 <MeMenuItem icon="download-outline" text="DOWNLOAD" onPress={() => {}} />
                 <MeMenuItem icon="notifications-outline" text="MY SUBSCRIBE" onPress={() => navigation.navigate('Subscriptions')} />
                 <MeMenuItem icon="settings-outline" text="SETTINGS" onPress={() => setActiveTab('Settings')} />
             </View>
          </View> 
        ) : null}
      </View>

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
  meMenuWrapper: { paddingHorizontal: 20 },
  meMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#222' },
  meMenuIcon: { marginRight: 20 },
  meMenuText: { color: '#FFF', fontSize: 16, fontWeight: '500' }
});