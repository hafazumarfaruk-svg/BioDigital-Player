import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, BackHandler, ScrollView, Share, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const { width } = Dimensions.get('window');
// গ্লোবাল প্লেয়ারের সমান উচ্চতা রাখা হয়েছে যেন ভিডিওটি এর ঠিক উপরে বসতে পারে
const PLAYER_HEIGHT = (width * 9) / 16; 
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};
  
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isExpandedDesc, setIsExpandedDesc] = useState(false); // ডেসক্রিপশন বড়-ছোট করার জন্য

  useEffect(() => {
    checkSubscriptionStatus();
    fetchRelatedVideos(false);
  }, [videoId]);

  // ফিজিক্যাল ব্যাক বাটন চাপলে ভিডিও যেন বন্ধ না হয়ে গ্লোবাল মিনি-প্লেয়ারে চলে যায়
  useEffect(() => {
    const backAction = () => {
      DeviceEventEmitter.emit('minimizeVideo');
      navigation.goBack();
      return true; 
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove(); 
  }, []);

  // সাবস্ক্রিপশন স্ট্যাটাস চেক করা (১০০% কার্যকর লোকাল স্টোরেজ)
  const checkSubscriptionStatus = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const subbed = (subs ? JSON.parse(subs) : []).some(s => s.name === videoData.channel);
      setIsSubscribed(subbed);
    } catch (e) {}
  };

  const toggleSubscription = async () => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === videoData.channel);
      
      if (exists) {
        subs = subs.filter(s => s.name !== videoData.channel);
      } else {
        subs.push({ id: Date.now().toString(), name: videoData.channel, avatar: videoData.avatar });
      }
      
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setIsSubscribed(!exists);
    } catch (e) {}
  };

  // শেয়ার বাটন ফাংশন (১০০% কার্যকর নেটিভ শেয়ারিং)
  const handleShare = async () => {
    try {
      await Share.share({
        message: `অসাধারণ এই ভিডিওটি দেখুন: ${videoData.title}\nhttps://www.youtube.com/watch?v=${videoId}`,
      });
    } catch (error) { console.error(error); }
  };

  const fetchRelatedVideos = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    try {
      let query = videoData.channel || "trending bangla";
      if (isLoadMore && videoData.title) query = videoData.title.split(' ').slice(0, 3).join(' ') + " " + Math.floor(Math.random() * 100);
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const match = (await response.text()).match(/ytInitialData\s*=\s*({.+?});/) || (await response.text()).match(/var ytInitialData = (.*?);<\/script>/);
      if (!match || !match[1]) return;
      
      const extractedVids = [];
      const extractNodes = (node) => {
        if (Array.isArray(node)) node.forEach(extractNodes);
        else if (node && typeof node === 'object') {
          if (node.videoRenderer && node.videoRenderer.videoId && node.videoRenderer.videoId !== videoId) {
            extractedVids.push({ 
              id: node.videoRenderer.videoId, title: node.videoRenderer.title?.runs?.[0]?.text, 
              channel: node.videoRenderer.ownerText?.runs?.[0]?.text || 'Channel', views: node.videoRenderer.viewCountText?.simpleText, 
              thumbnail: `https://i.ytimg.com/vi/${node.videoRenderer.videoId}/hqdefault.jpg`,
              avatar: node.videoRenderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
            });
          } else Object.values(node).forEach(extractNodes);
        }
      };
      extractNodes(JSON.parse(match[1]));
      if (isLoadMore) setRelatedVideos(prev => [...prev, ...extractedVids.filter(v => !prev.find(p => p.id === v.id)).slice(0, 10)]);
      else setRelatedVideos(extractedVids.slice(0, 15));
    } catch (e) {} finally { setIsLoadingMore(false); }
  };

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      
      {/* ইউটিউবের স্মার্ট এক্সপান্ডেবল টাইটেল এরিয়া */}
      <TouchableOpacity 
         activeOpacity={0.8} 
         onPress={() => setIsExpandedDesc(!isExpandedDesc)}
         style={styles.titleSection}
      >
         <Text style={styles.mainTitle} numberOfLines={isExpandedDesc ? null : 2}>{videoData?.title}</Text>
         <View style={styles.metaRow}>
            <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>
            {!isExpandedDesc && <Text style={styles.moreText}>...more</Text>}
         </View>
      </TouchableOpacity>
      
      {/* চ্যানেল রো এবং সাবস্ক্রাইব বাটন (১০০% কার্যকর) */}
      <View style={styles.channelRow}>
        <TouchableOpacity style={styles.channelLeft} onPress={() => {
            DeviceEventEmitter.emit('minimizeVideo');
            navigation.navigate('Channel', { channelName: videoData.channel, channelAvatar: videoData.avatar });
        }}>
          <Image source={{ uri: videoData.avatar }} style={styles.channelAvatar} />
          <View style={styles.channelTextCol}>
            <Text style={styles.channelName} numberOfLines={1}>{videoData.channel}</Text>
            <Text style={styles.subCount}>Subscriber Info</Text>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.subscribeBtn, isSubscribed && styles.subscribedBtn]} onPress={toggleSubscription}>
          {isSubscribed && <Ionicons name="notifications-outline" size={16} color="#FFF" style={{marginRight: 6}} />}
          <Text style={[styles.subscribeText, isSubscribed && styles.subscribedText]}>
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* অ্যাকশন রো: অকেজো বাটনগুলো বাদ দিয়ে শুধু কার্যকরী বাটন (Share) রাখা হয়েছে */}
      <View style={styles.actionRowContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionScroll}>
           
           <TouchableOpacity style={styles.actionPill} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={20} color="#FFF" />
              <Text style={styles.actionPillText}>Share</Text>
           </TouchableOpacity>

           {/* অন্যান্য অকেজো বাটন (লাইক, ডাউনলোড ইত্যাদি) আপনার নির্দেশ অনুযায়ী রিমুভ করা হয়েছে */}

        </ScrollView>
      </View>
      
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" translucent={false} />
      
      {/* গ্লোবাল প্লেয়ারটি ঠিক এই ফাঁকা জায়গাটির (playerWrapper) উপরে এসে বসবে */}
      <View style={styles.playerWrapper}>
         <View style={styles.topControlOverlay}>
            <TouchableOpacity onPress={() => { DeviceEventEmitter.emit('minimizeVideo'); navigation.goBack(); }} style={styles.backButtonBtn}>
               {/* ইউটিউবের মতো নিচে নামানোর অ্যারো (Chevron Down) */}
               <Ionicons name="chevron-down" size={32} color="#FFF" />
            </TouchableOpacity>
         </View>
      </View>

      <FlatList 
        ListHeaderComponent={renderHeader}
        data={relatedVideos} 
        keyExtractor={(item, index) => item.id + index.toString()} 
        renderItem={({item}) => (
          <TouchableOpacity style={styles.recCard} onPress={() => {
              // রিলেটেড ভিডিওতে ক্লিক করলে গ্লোবাল প্লেয়ারকে নতুন ভিডিও প্লে করার কমান্ড দেওয়া হচ্ছে
              DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item });
              navigation.push('Player', { videoId: item.id, videoData: item });
          }}>
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
    
    // প্লেয়ার র‍্যাপার: গ্লোবাল ভিডিওর জন্য ফাঁকা জায়গা
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: 'transparent', position: 'relative' },
    topControlOverlay: { position: 'absolute', top: 10, left: 10, zIndex: 10 },
    backButtonBtn: { padding: 5, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 20 },

    detailsContainer: { paddingBottom: 10 },
    
    // টাইটেল সেকশন (এক্সপান্ডেবল)
    titleSection: { padding: 12, paddingTop: 15 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', lineHeight: 26 },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
    mainViews: { color: '#AAA', fontSize: 12, fontWeight: '500' },
    moreText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 10 },
    
    // চ্যানেল ইনফো এবং সাবস্ক্রাইব
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    channelLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    channelAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#333' },
    channelTextCol: { flex: 1, paddingRight: 10 },
    channelName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    subCount: { color: '#AAA', fontSize: 12, marginTop: 2 },
    
    subscribeBtn: { backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 25, flexDirection: 'row', alignItems: 'center' },
    subscribeText: { color: '#0F0F0F', fontSize: 14, fontWeight: 'bold' },
    subscribedBtn: { backgroundColor: '#272727' },
    subscribedText: { color: '#FFF' },

    // ইউটিউব অ্যাকশন পিল (Action Pill)
    actionRowContainer: { marginTop: 5, marginBottom: 10 },
    actionScroll: { paddingHorizontal: 12, gap: 10 },
    actionPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#272727', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 25 },
    actionPillText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginLeft: 6 },

    // রিলেটেড ভিডিও কার্ড
    recCard: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 15 },
    recThumb: { width: 150, height: 85, borderRadius: 8, backgroundColor: '#222' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'flex-start', paddingTop: 2 },
    recTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 6, lineHeight: 20 },
    recMeta: { color: '#AAA', fontSize: 12 }
});