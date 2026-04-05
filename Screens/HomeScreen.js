import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Platform, Dimensions, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

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
  const [activeFeedTab, setActiveFeedTab] = useState('Video'); 
  
  const [videos, setVideos] = useState([]);
  const [liveVideos, setLiveVideos] = useState([]);
  const [liveChannels, setLiveChannels] = useState([]);
  const [liveChannelQuery, setLiveChannelQuery] = useState('');

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
          return `${randomSub} ${suffix}`.trim();
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
    if (activeQuery) {
        fetchContent(activeQuery, true);
    }
    if (Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden");
  }, [activeQuery, activeFeedTab]);

  const handleRefresh = async () => { 
    setRefreshing(true); 
    setActiveQuery(await getAlgorithmicTopic()); 
  };

  const fetchContent = async (query, isNewSearch = false) => {
    if (isNewSearch) setLoading(true);
    
    const targetQuery = activeFeedTab === 'Live' ? `${query} live now` : query;

    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(targetQuery)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const html = await response.text();
      const match = html.match(/ytInitialData\s*=\s*({.+?});/) || html.match(/var ytInitialData = (.*?);<\/script>/);
      
      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extractedVideos = []; 
        const extractedShorts = [];
        const extractedLiveChannels = [];

        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                const vid = node.videoRenderer;
                const isLive = JSON.stringify(vid).includes("BADGE_STYLE_TYPE_LIVE_NOW");
                const isShort = (vid.title?.runs?.[0]?.text?.toLowerCase() || '').includes('short');

                const data = {
                    id: vid.videoId, title: vid.title?.runs?.[0]?.text, 
                    channel: vid.ownerText?.runs?.[0]?.text, views: vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText, 
                    duration: vid.lengthText?.simpleText, publishedTime: vid.publishedTimeText?.simpleText,
                    thumbnail: `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`,
                    avatar: vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url,
                    isLive: isLive
                };

                if (activeFeedTab === 'Live') {
                    if (isLive) {
                        extractedVideos.push(data);
                        // লাইভ ভিডিওর ভেতর থেকেই সরাসরি চ্যানেল এক্সট্রাক্ট করা হচ্ছে
                        extractedLiveChannels.push({
                            id: vid.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || data.channel, 
                            name: data.channel, 
                            avatar: data.avatar
                        });
                    }
                } else {
                    if (!isShort) extractedVideos.push(data);
                }
            } else if (node.channelRenderer && activeFeedTab === 'Live') {
                const ch = node.channelRenderer;
                if (JSON.stringify(ch).includes("BADGE_STYLE_TYPE_LIVE_NOW")) {
                    extractedLiveChannels.push({
                        id: ch.channelId, name: ch.title?.simpleText, 
                        avatar: ch.thumbnail?.thumbnails?.[0]?.url,
                    });
                }
            } else if (node.reelItemRenderer) {
                extractedShorts.push(node.reelItemRenderer);
            }
            Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);

        if (activeFeedTab === 'Live') {
            setLiveVideos(isNewSearch ? extractedVideos : [...liveVideos, ...extractedVideos]);
            
            // নতুন এবং পুরাতন চ্যানেল মিলিয়ে ডুপ্লিকেট রিমুভ করা হচ্ছে
            const allChannels = isNewSearch ? extractedLiveChannels : [...liveChannels, ...extractedLiveChannels];
            const uniqueChannels = Array.from(new Map(allChannels.map(item => [item.name, item])).values());
            setLiveChannels(uniqueChannels);
        } else {
            setVideos(isNewSearch ? extractedVideos : [...videos, ...extractedVideos]);
        }
      }
    } catch (e) {} finally { setLoading(false); setRefreshing(false); }
  };

  const handleVideoPress = (item) => {
    DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item });
    navigation.navigate('Player', { videoId: item.id, videoData: item });
  };

  const renderVideoItem = ({ item }) => (
    <View style={styles.videoCard}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => handleVideoPress(item)}>
        <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
        {item.isLive ? (
            <View style={styles.liveBadge}><Text style={styles.liveText}>LIVE</Text></View>
        ) : item.duration ? (
            <View style={styles.durationBadge}><Text style={styles.durationText}>{item.duration}</Text></View>
        ) : null}
      </TouchableOpacity>
      <View style={styles.videoInfo}>
        <TouchableOpacity onPress={() => navigation.navigate('Channel', { channelName: item.channel, channelAvatar: item.avatar })}>
          <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
        </TouchableOpacity>
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.meta}>{item.channel} • {item.views}</Text>
        </View>
      </View>
    </View>
  );

  const LiveHeader = () => {
    // রিয়েল-টাইম লোকাল ফিল্টারিং (টাইপ করার সাথে সাথে কাজ করবে)
    const filteredChannels = liveChannels.filter(ch => ch.name?.toLowerCase().includes(liveChannelQuery.toLowerCase()));

    return (
      <View style={styles.liveHeaderContainer}>
        <View style={styles.liveSearchBox}>
          <TextInput 
            style={styles.liveInput} 
            placeholder="লাইভ চ্যানেল খুঁজুন..." 
            placeholderTextColor="#888"
            value={liveChannelQuery}
            onChangeText={setLiveChannelQuery}
            onSubmitEditing={() => fetchContent(liveChannelQuery, true)} // এন্টার চাপলে গ্লোবাল সার্চ হবে
            returnKeyType="search"
          />
          <TouchableOpacity onPress={() => fetchContent(liveChannelQuery, true)}>
            <Ionicons name="search" size={20} color="#AAA" />
          </TouchableOpacity>
        </View>
        
        <Text style={styles.sectionTitle}>লাইভ চ্যানেলসমূহ</Text>
        <FlatList 
          horizontal 
          showsHorizontalScrollIndicator={false}
          data={filteredChannels}
          keyExtractor={(item, index) => item.id + index.toString()}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.liveChanItem} onPress={() => navigation.navigate('Channel', { channelName: item.name, channelAvatar: item.avatar })}>
              <View style={styles.liveAvatarWrapper}>
                <Image source={{ uri: item.avatar }} style={styles.liveAvatar} />
                <View style={styles.miniLiveBadge} />
              </View>
              <Text style={styles.liveChanName} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={{color: '#888', fontStyle: 'italic'}}>কোনো চ্যানেল পাওয়া যায়নি...</Text>}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" translucent={true} />
      
      {activeTab === 'Home' && (
        <View style={styles.topSection}>
          <View style={styles.header}>
            <View style={styles.logoContainer}><Ionicons name="logo-youtube" size={28} color="#FF0000" /><Text style={styles.logoText}>MyTube</Text></View>
            <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('Search')}>
              <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>{searchQuery || "সার্চ..."}</Text>
              <Ionicons name="search" size={18} color="#AAA" />
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRow}>
            <TouchableOpacity style={[styles.toggleBtn, activeFeedTab === 'Video' && styles.activeToggle]} onPress={() => setActiveFeedTab('Video')}>
              <Text style={[styles.toggleText, activeFeedTab === 'Video' && styles.activeToggleText]}>ভিডিও</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toggleBtn, activeFeedTab === 'Live' && styles.activeToggle]} onPress={() => setActiveFeedTab('Live')}>
              <Text style={[styles.toggleText, activeFeedTab === 'Live' && styles.activeToggleText]}>লাইভ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.mainContent}>
        {activeTab === 'Home' ? (
          loading && (activeFeedTab === 'Video' ? videos.length === 0 : liveVideos.length === 0) ? ( 
            <ActivityIndicator size="large" color="#FF0000" style={{ flex: 1, justifyContent: 'center' }} /> 
          ) : (
            <FlatList 
              ListHeaderComponent={activeFeedTab === 'Live' ? <LiveHeader /> : null}
              data={activeFeedTab === 'Video' ? videos : liveVideos} 
              renderItem={renderVideoItem} 
              keyExtractor={(item, index) => item.id + index.toString()} 
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" />} 
              onEndReached={() => { if(!loading) fetchContent(activeFeedTab === 'Live' ? (liveChannelQuery || activeQuery) : activeQuery, false) }}
              onEndReachedThreshold={0.5}
            />
          )
        ) : activeTab === 'Shorts' ? ( <ShortsScreen initialVideoId={selectedShortId} />
        ) : activeTab === 'Settings' ? ( <SettingsScreen />
        ) : activeTab === 'ME' ? ( 
            <View style={styles.meContainer}><Text style={{color: '#FFF'}}>User Profile</Text></View> 
        ) : null}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity onPress={() => setActiveTab('Home')} style={styles.tab}><Ionicons name={activeTab==='Home'?'home':'home-outline'} size={24} color={activeTab==='Home'?'#FFF':'#888'} /><Text style={[styles.tabText, activeTab==='Home' && {color:'#FFF'}]}>Home</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('Shorts')} style={styles.tab}><Ionicons name={activeTab==='Shorts'?'play-circle':'play-circle-outline'} size={24} color={activeTab==='Shorts'?'#FFF':'#888'} /><Text style={[styles.tabText, activeTab==='Shorts' && {color:'#FFF'}]}>Shorts</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('ME')} style={styles.tab}><Ionicons name={activeTab==='ME'?'person':'person-outline'} size={24} color={activeTab==='ME'?'#FFF':'#888'} /><Text style={[styles.tabText, activeTab==='ME' && {color:'#FFF'}]}>ME</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  topSection: { backgroundColor: '#0F0F0F', borderBottomWidth: 1, borderBottomColor: '#222' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
  logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },
  
  toggleRow: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 10 },
  toggleBtn: { paddingHorizontal: 20, paddingVertical: 6, borderRadius: 15, marginRight: 10, backgroundColor: '#222' },
  activeToggle: { backgroundColor: '#FFF' },
  toggleText: { color: '#AAA', fontSize: 13, fontWeight: 'bold' },
  activeToggleText: { color: '#000' },

  mainContent: { flex: 1, backgroundColor: '#0F0F0F' },
  videoCard: { marginBottom: 15 },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  liveBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: '#FF0000', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  liveText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12 },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12 },
  textContainer: { flex: 1 },
  title: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  meta: { color: '#AAA', fontSize: 12, marginTop: 4 },

  liveHeaderContainer: { padding: 12, borderBottomWidth: 4, borderBottomColor: '#222' },
  liveSearchBox: { flexDirection: 'row', backgroundColor: '#222', borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', height: 40, marginBottom: 15 },
  liveInput: { flex: 1, color: '#FFF', fontSize: 14 },
  sectionTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  liveChanItem: { width: 80, alignItems: 'center', marginRight: 15 },
  liveAvatarWrapper: { position: 'relative' },
  liveAvatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#FF0000' },
  miniLiveBadge: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF0000', borderWidth: 2, borderColor: '#0F0F0F' },
  liveChanName: { color: '#AAA', fontSize: 11, marginTop: 6, textAlign: 'center' },

  tabBar: { flexDirection: 'row', height: 60, backgroundColor: '#0F0F0F', borderTopWidth: 1, borderTopColor: '#222' },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabText: { fontSize: 10, color: '#888', marginTop: 4 },
  meContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});