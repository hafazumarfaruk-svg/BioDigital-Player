import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, FlatList, SafeAreaView, StatusBar, Dimensions, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function ChannelScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();

  const { channelData = {}, channelName: paramChannelName, channelAvatar: paramAvatar } = route.params || {};
  const channelName = channelData?.channel || paramChannelName || 'YouTube Channel';
  const channelAvatar = channelData?.avatar || paramAvatar || 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';

  const [activeTab, setActiveTab] = useState('Videos');
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [thumbQuality, setThumbQuality] = useState('High');
  const [channelBanner, setChannelBanner] = useState('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop');
  const [subscriberCount, setSubscriberCount] = useState('N/A');
  const [tabData, setTabData] = useState({ Videos: [], Shorts: [] });

  useEffect(() => { fetchChannelData(); }, [channelName]);

  useEffect(() => {
    const loadGlobals = async () => {
      try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        if (subs) setIsSubscribed(JSON.parse(subs).some(sub => sub.name === channelName));
        const quality = await AsyncStorage.getItem('thumbnailQuality');
        if (quality) setThumbQuality(quality);
      } catch (e) {}
    };
    if (isFocused) loadGlobals();
  }, [channelName, isFocused]);

  const extractChannelDataRecursively = (node, categorizedData) => {
    const parseVid = (vid) => ({
        id: String(vid.videoId), title: String(vid.title?.runs?.[0]?.text || vid.title?.simpleText || 'No Title'), views: String(vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || ''), publishedTime: String(vid.publishedTimeText?.simpleText || ''), duration: String(vid.lengthText?.simpleText || ''),
        thumbnail: thumbQuality === 'Data Saver' ? `https://i.ytimg.com/vi/${vid.videoId}/mqdefault.jpg` : `https://i.ytimg.com/vi/${vid.videoId}/hqdefault.jpg`, channel: channelName, avatar: channelAvatar
    });

    if (Array.isArray(node)) node.forEach(child => extractChannelDataRecursively(child, categorizedData));
    else if (node !== null && typeof node === 'object') {
      if ((node.videoRenderer && node.videoRenderer.videoId) || (node.gridVideoRenderer && node.gridVideoRenderer.videoId)) {
        const parsedVid = parseVid(node.videoRenderer || node.gridVideoRenderer);
        if (parsedVid.duration.length > 0 && parsedVid.duration.length <= 5) categorizedData.Shorts.push(parsedVid); else categorizedData.Videos.push(parsedVid);
      } else if (node.reelItemRenderer && node.reelItemRenderer.videoId) {
        categorizedData.Shorts.push({
          id: String(node.reelItemRenderer.videoId), title: String(node.reelItemRenderer.headline?.simpleText || node.reelItemRenderer.title?.simpleText || 'Short Video'), views: String(node.reelItemRenderer.viewCountText?.simpleText || 'N/A'),
          thumbnail: thumbQuality === 'Data Saver' ? `https://i.ytimg.com/vi/${node.reelItemRenderer.videoId}/mqdefault.jpg` : `https://i.ytimg.com/vi/${node.reelItemRenderer.videoId}/hqdefault.jpg`, channel: channelName, avatar: channelAvatar, duration: 'Short'
        });
      } else Object.values(node).forEach(child => extractChannelDataRecursively(child, categorizedData));
    }
  };

  const fetchChannelData = async () => {
    setLoading(true);
    try {
      const searchHtml = await (await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`, { headers: { 'User-Agent': DESKTOP_AGENT } })).text();
      let searchMatch = searchHtml.match(/ytInitialData\s*=\s*({.+?});/) || searchHtml.match(/var ytInitialData = (.*?);<\/script>/);

      let targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(channelName)}`;
      if (searchMatch && searchMatch[1]) {
        let channelUrl = null;
        const findChannelUrl = (node) => {
          if (channelUrl) return;
          if (node?.channelRenderer && (node.channelRenderer.title?.simpleText || "").toLowerCase().includes(channelName.toLowerCase().split(' ')[0])) channelUrl = node.channelRenderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
          if (node && typeof node === 'object') Object.values(node).forEach(child => findChannelUrl(child));
        };
        findChannelUrl(JSON.parse(searchMatch[1]));
        if (channelUrl) targetUrl = `https://www.youtube.com${channelUrl}/videos`;
      }

      const channelHtml = await (await fetch(targetUrl, { headers: { 'User-Agent': DESKTOP_AGENT } })).text();
      let channelMatch = channelHtml.match(/ytInitialData\s*=\s*({.+?});/) || channelHtml.match(/var ytInitialData = (.*?);<\/script>/);

      const categorizedData = { Videos: [], Shorts: [] };
      if (channelMatch && channelMatch[1]) {
        const parsedData = JSON.parse(channelMatch[1]);
        const header = parsedData?.header?.c4TabbedHeaderRenderer || parsedData?.header?.pageHeaderRenderer;
        
        let bannerSrc = header?.banner?.thumbnails || header?.pageHeaderBanner?.pageHeaderBannerImageViewModel?.image?.sources || header?.content?.pageHeaderViewModel?.banner?.imageBannerViewModel?.image?.sources;
        if (bannerSrc && bannerSrc.length > 0) setChannelBanner(bannerSrc[bannerSrc.length - 1].url);

        const subs = header?.subscriberCountText?.simpleText || header?.content?.pageHeaderViewModel?.metadata?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || header?.content?.pageHeaderViewModel?.metadata?.metadataRows?.[1]?.metadataParts?.[0]?.text?.content;
        if (subs) setSubscriberCount(subs);

        extractChannelDataRecursively(parsedData, categorizedData);
      }
      setTabData(categorizedData);
    } catch (error) {} finally { setLoading(false); }
  };

  const handleSubscriptionToggle = async () => {
    try {
      let parsedSubs = JSON.parse(await AsyncStorage.getItem('subscribedChannels') || '[]');
      if (isSubscribed) parsedSubs = parsedSubs.filter(sub => sub.name !== channelName); else parsedSubs.push({ id: Date.now().toString(), name: channelName, avatar: channelAvatar });
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(parsedSubs)); setIsSubscribed(!isSubscribed);
    } catch(e) {}
  };

  const renderItem = ({ item }) => {
    if (activeTab === 'Shorts') {
      return (
        <TouchableOpacity style={styles.shortGridItem} activeOpacity={0.8} onPress={() => navigation.navigate('ShortsScreen', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.shortGridImage} />
          <View style={styles.shortViewsOverlay}><Ionicons name="play-outline" size={14} color="#FFF" /><Text style={styles.shortViewsText}>{item.views}</Text></View>
          <View style={{ padding: 8, paddingBottom: 12 }}><Text style={styles.shortTitle} numberOfLines={2}>{item.title}</Text></View>
        </TouchableOpacity>
      );
    }
    return (
      <View style={styles.videoCard}>
        <TouchableOpacity style={styles.thumbnailContainer} activeOpacity={0.8} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnailImage} />
          {item.duration ? <Text style={styles.durationBadge}>{item.duration}</Text> : null}
        </TouchableOpacity>
        <View style={styles.videoInfoContainer}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
            <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.videoMeta}>{item.views ? `${item.views}` : ''}{item.views && item.publishedTime ? ' • ' : ''}{item.publishedTime ? `${item.publishedTime}` : ''}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const ChannelHeader = () => (
    <View>
      <Image source={{ uri: channelBanner }} style={styles.bannerImage} />
      <View style={styles.channelProfileSection}>
        <Image source={{ uri: channelAvatar }} style={styles.channelLogoLarge} />
        <View style={styles.channelTextInfo}>
          <Text style={styles.channelTitle}>{channelName}</Text><Text style={styles.channelMeta}>@{(channelName).replace(/\s+/g, '').toLowerCase()} • {subscriberCount}</Text>
        </View>
      </View>
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity style={[styles.subscribeBtn, isSubscribed ? styles.subscribedState : styles.unsubscribedState]} onPress={handleSubscriptionToggle} activeOpacity={0.8}>
          <Ionicons name={isSubscribed ? "notifications-outline" : "notifications"} size={18} color={isSubscribed ? "#FFF" : "#0F0F0F"} />
          <Text style={[styles.subscribeText, isSubscribed ? {color: '#FFF'} : {color: '#0F0F0F'}]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tabScrollContainer}>
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={['Videos', 'Shorts']} keyExtractor={(item) => item} 
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.tabButton, activeTab === item && styles.activeTabButton]} onPress={() => setActiveTab(item)}><Text style={[styles.tabText, activeTab === item && styles.activeTabText]}>{item}</Text></TouchableOpacity>
          )}
        />
      </View>
      {loading && <View style={{ padding: 50, alignItems: 'center' }}><ActivityIndicator size="large" color="#FF0000" /></View>}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIcon}><Ionicons name="arrow-back" size={24} color="#FFF" /></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{channelName}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.headerIcon}><Ionicons name="home" size={22} color="#FFF" /></TouchableOpacity>
      </View>
      <FlatList key={activeTab === 'Shorts' ? 'grid-2' : 'list-1'} numColumns={activeTab === 'Shorts' ? 2 : 1} data={tabData[activeTab] || []} renderItem={renderItem} keyExtractor={(item, index) => item.id + index.toString()} ListHeaderComponent={ChannelHeader} ListEmptyComponent={loading ? null : <View style={styles.emptyStateContainer}><Text style={styles.emptyStateText}>{activeTab === 'Shorts' ? 'No short video' : 'No videos found'}</Text></View>} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 70 }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', height: 50, paddingHorizontal: 10 },
  headerIcon: { padding: 10 },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 5 },
  bannerImage: { width: width, height: width * 0.25, resizeMode: 'cover', backgroundColor: '#222' },
  channelProfileSection: { flexDirection: 'row', padding: 15, alignItems: 'center' },
  channelLogoLarge: { width: 70, height: 70, borderRadius: 35, marginRight: 15, backgroundColor: '#333' },
  channelTextInfo: { flex: 1 },
  channelTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  channelMeta: { fontSize: 12, color: '#AAA', marginTop: 2, marginBottom: 8 },
  actionButtonsContainer: { flexDirection: 'row', paddingHorizontal: 15, paddingBottom: 15 },
  subscribeBtn: { flex: 1, flexDirection: 'row', paddingVertical: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center', gap: 5 },
  subscribedState: { backgroundColor: '#272727' },
  unsubscribedState: { backgroundColor: '#F1F1F1' },
  subscribeText: { fontSize: 14, fontWeight: 'bold' },
  tabScrollContainer: { borderBottomWidth: 1, borderBottomColor: '#222' },
  tabButton: { paddingVertical: 15, paddingHorizontal: 20 },
  activeTabButton: { borderBottomWidth: 2, borderBottomColor: '#FFF' },
  tabText: { color: '#AAA', fontSize: 15, fontWeight: '500' },
  activeTabText: { color: '#FFF', fontWeight: 'bold' },
  videoCard: { flexDirection: 'row', marginBottom: 15, paddingHorizontal: 10, marginTop: 10 },
  thumbnailContainer: { width: 160, height: 90, position: 'relative', backgroundColor: '#222', borderRadius: 8, overflow: 'hidden' },
  thumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  durationBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.8)', color: '#FFF', fontSize: 11, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, fontWeight: 'bold' },
  videoInfoContainer: { flex: 1, paddingLeft: 12, justifyContent: 'flex-start', paddingTop: 2 },
  videoTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 6, lineHeight: 20 },
  videoMeta: { color: '#AAA', fontSize: 12 },
  shortGridItem: { width: (width / 2) - 10, margin: 5, position: 'relative', backgroundColor: '#111', borderRadius: 8, overflow: 'hidden' },
  shortGridImage: { width: '100%', height: 250, resizeMode: 'cover' },
  shortViewsOverlay: { position: 'absolute', bottom: 55, left: 5, flexDirection: 'row', alignItems: 'center' },
  shortViewsText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 3, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  shortTitle: { color: '#FFF', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  emptyStateContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyStateText: { color: '#AAA', fontSize: 16, fontWeight: '500' }
});