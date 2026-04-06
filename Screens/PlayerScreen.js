import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import * as FileSystem from 'expo-file-system'; 
import { useFocusEffect } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};
  
  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isExpandedDesc, setIsExpandedDesc] = useState(false);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStep, setDownloadStep] = useState('selection'); 
  const [downloadLinks, setDownloadLinks] = useState([]);
  const [downloadType, setDownloadType] = useState('');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useFocusEffect(
    useCallback(() => {
      DeviceEventEmitter.emit('maximizeVideo');
      return () => {
        DeviceEventEmitter.emit('minimizeVideo');
      };
    }, [])
  );

  useEffect(() => {
    checkSubscriptionStatus();
    fetchRelatedVideos(false);
    if (videoId && videoData) {
        DeviceEventEmitter.emit('playVideo', { videoId: videoId, videoData: videoData });
    }
  }, [videoId]);

  const checkSubscriptionStatus = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const parsedSubs = subs ? JSON.parse(subs) : [];
      setIsSubscribed(parsedSubs.some(s => s.name === videoData.channel));
    } catch (e) {}
  };

  const toggleSubscription = async () => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === videoData.channel);
      if (exists) subs = subs.filter(s => s.name !== videoData.channel);
      else subs.push({ id: Date.now().toString(), name: videoData.channel, avatar: videoData.avatar });
      
      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setIsSubscribed(!exists);
    } catch (e) {}
  };

  const handleDownloadExecute = async (item) => {
    try {
      setShowDownloadModal(false);
      setIsDownloading(true);
      setDownloadProgress(0);

      const safeTitle = (videoData.title || 'video').replace(/[^a-zA-Z0-9]/g, '_');
      const fileExt = downloadType === 'audio' ? 'mp3' : 'mp4';
      const fileUri = `${FileSystem.documentDirectory}${safeTitle}_${item.quality}.${fileExt}`;

      // [FIX]: ইউটিউবের অ্যান্টি-বট সিস্টেম বাইপাস করার জন্য User-Agent হেডার যুক্ত করা হলো
      const downloadResumable = FileSystem.createDownloadResumable(
        item.url, 
        fileUri, 
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        },
        (downloadInfo) => { setDownloadProgress(downloadInfo.totalBytesWritten / downloadInfo.totalBytesExpectedToWrite); }
      );

      const { uri } = await downloadResumable.downloadAsync();
      const existingDownloads = await AsyncStorage.getItem('recorded_downloads');
      let downloadList = existingDownloads ? JSON.parse(existingDownloads) : [];
      
      downloadList.unshift({ id: Date.now().toString(), videoId, title: videoData.title, thumbnail: videoData.thumbnail, quality: item.quality, type: downloadType, url: uri, date: new Date().toLocaleDateString() });
      await AsyncStorage.setItem('recorded_downloads', JSON.stringify(downloadList));

      setIsDownloading(false);
      Alert.alert("সফল", "ডাউনলোড মেমোরিতে সেভ হয়েছে!");
    } catch (error) {
      setIsDownloading(false);
      Alert.alert("ত্রুটি", "নেটওয়ার্ক সমস্যার কারণে ডাউনলোড ব্যর্থ হয়েছে।");
      console.error("Download Error:", error);
    }
  };

  const handleDownloadInit = (type) => {
    setDownloadType(type);
    setDownloadStep('fetching');
    fetchDownloadLinks(type);
  };

  const fetchDownloadLinks = async (type) => {
    try {
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(targetUrl)}&action=download`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data.success && data.availableLinks) {
        setDownloadLinks(data.availableLinks);
        setDownloadStep('list');
      } else {
        Alert.alert("ত্রুটি", "কোনো লিংক পাওয়া যায়নি।");
        setShowDownloadModal(false);
      }
    } catch (error) {
      Alert.alert("সার্ভার এরর", "আপনার Termux সার্ভারটি সচল আছে কিনা যাচাই করুন।");
      setShowDownloadModal(false);
    }
  };

  const fetchRelatedVideos = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(videoData.channel || "trending bangla")}`);
      const text = await response.text();
      const match = text.match(/var ytInitialData = (.*?);<\/script>/);
      if (!match) return;
      const jsonData = JSON.parse(match[1]);
      const extractedVids = [];
      const extractNodes = (node) => {
        if (Array.isArray(node)) node.forEach(extractNodes);
        else if (node && typeof node === 'object') {
          if (node.videoRenderer && node.videoRenderer.videoId !== videoId) {
            extractedVids.push({ 
              id: node.videoRenderer.videoId, title: node.videoRenderer.title?.runs?.[0]?.text, 
              channel: node.videoRenderer.ownerText?.runs?.[0]?.text, views: node.videoRenderer.viewCountText?.simpleText, 
              thumbnail: `https://i.ytimg.com/vi/${node.videoRenderer.videoId}/hqdefault.jpg`,
              avatar: node.videoRenderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
            });
          } else Object.values(node).forEach(extractNodes);
        }
      };
      extractNodes(jsonData);
      setRelatedVideos(isLoadMore ? [...relatedVideos, ...extractedVids] : extractedVids.slice(0, 15));
    } catch (e) {} finally { setIsLoadingMore(false); }
  };

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <View style={styles.titleRow}>
         <TouchableOpacity activeOpacity={0.8} onPress={() => setIsExpandedDesc(!isExpandedDesc)} style={styles.titleTextContainer}>
            <Text style={styles.mainTitle} numberOfLines={isExpandedDesc ? null : 2}>{videoData?.title}</Text>
         </TouchableOpacity>
         <TouchableOpacity style={styles.downloadIconBtn} onPress={() => { setShowDownloadModal(true); setDownloadStep('selection'); }}>
            <Ionicons name="download-outline" size={24} color="#FFF" />
         </TouchableOpacity>
      </View>

      <View style={styles.metaRow}>
         <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>
         <Text style={styles.moreText}>...more</Text>
      </View>

      <View style={styles.channelRow}>
        <TouchableOpacity style={styles.channelLeft} onPress={() => navigation.navigate('Channel', { channelName: videoData.channel, channelAvatar: videoData.avatar })}>
          <Image source={{ uri: videoData.avatar }} style={styles.channelAvatar} />
          <View style={styles.channelTextCol}>
            <Text style={styles.channelName} numberOfLines={1}>{videoData.channel}</Text>
            <Text style={styles.subCount}>Subscriber Info</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.subscribeBtn, isSubscribed && styles.subscribedBtn]} onPress={toggleSubscription}>
          <Text style={[styles.subscribeText, isSubscribed && styles.subscribedText]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.divider} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      
      <View style={styles.appHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconBtn} disabled={isDownloading}>
           <Ionicons name="chevron-down" size={32} color={isDownloading ? "#555" : "#FFF"} />
        </TouchableOpacity>
        <View style={{flex: 1}} />
        <TouchableOpacity onPress={() => navigation.navigate('Search')} style={styles.headerIconBtn}>
           <Ionicons name="search" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.playerWrapper}></View>

      {isDownloading && (
        <View style={styles.progressContainer}>
           <Text style={styles.progressText}>ডাউনলোড হচ্ছে... {Math.round(downloadProgress * 100)}%</Text>
           <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${downloadProgress * 100}%` }]} /></View>
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
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showDownloadModal} transparent animationType="slide" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ডাউনলোড অপশন</Text>
              <TouchableOpacity onPress={() => setShowDownloadModal(false)}><Ionicons name="close" size={26} color="#FFF" /></TouchableOpacity>
            </View>
            {downloadStep === 'selection' && (
              <View style={styles.selectionRow}>
                <TouchableOpacity style={styles.selectBtn} onPress={() => handleDownloadInit('video')}><Ionicons name="videocam" size={30} color="#FF0000" /><Text style={styles.selectText}>ভিডিও</Text></TouchableOpacity>
                <TouchableOpacity style={styles.selectBtn} onPress={() => handleDownloadInit('audio')}><Ionicons name="musical-notes" size={30} color="#00BFA5" /><Text style={styles.selectText}>অডিও</Text></TouchableOpacity>
              </View>
            )}
            {downloadStep === 'fetching' && <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#FF0000" /><Text style={styles.loadingText}>লিংক তৈরি হচ্ছে...</Text></View>}
            {downloadStep === 'list' && (
              <ScrollView style={styles.qualityList}>
                {downloadLinks.map((item, index) => (
                  <TouchableOpacity key={index} style={styles.qualityItem} onPress={() => handleDownloadExecute(item)}>
                    <Text style={styles.qualityText}>{item.quality}</Text>
                    <Ionicons name="download" size={20} color="#AAA" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F0F' },
    appHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 50 },
    headerIconBtn: { padding: 10 },
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: 'transparent' },
    
    progressContainer: { backgroundColor: '#1E1E1E', padding: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
    progressText: { color: '#00BFA5', fontSize: 14, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
    progressBarBg: { height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#00BFA5' },

    detailsContainer: { padding: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    titleTextContainer: { flex: 1, paddingRight: 15 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    downloadIconBtn: { padding: 8, backgroundColor: '#272727', borderRadius: 20 },
    
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, marginBottom: 15 },
    mainViews: { color: '#AAA', fontSize: 12 },
    moreText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 8 },
    divider: { height: 1, backgroundColor: '#222', marginVertical: 10 },
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    channelLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    channelAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#333' },
    channelTextCol: { flex: 1 },
    channelName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    subCount: { color: '#AAA', fontSize: 12 },
    subscribeBtn: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    subscribeText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
    subscribedBtn: { backgroundColor: '#222' },
    subscribedText: { color: '#FFF' },
    recCard: { flexDirection: 'row', padding: 10 },
    recThumb: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'center' },
    recTitle: { color: '#FFF', fontSize: 14 },
    recMeta: { color: '#AAA', fontSize: 11 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: height * 0.6 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    selectionRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20 },
    selectBtn: { alignItems: 'center' },
    selectText: { color: '#FFF', marginTop: 10, fontSize: 16 },
    loadingContainer: { padding: 40, alignItems: 'center' },
    loadingText: { color: '#AAA', marginTop: 15 },
    qualityList: { marginBottom: 20 },
    qualityItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
    qualityText: { color: '#FFF', fontSize: 16, fontWeight: '500' }
});