import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, FlatList, SafeAreaView, StatusBar, Image, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { Video } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system'; 

const { width, height } = Dimensions.get('window');
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function ShortsScreen({ initialVideoId, route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [shortsList, setShortsList] = useState([]);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isOffline, setIsOffline] = useState(false);
  const [downloadedShorts, setDownloadedShorts] = useState([]);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customCount, setCustomCount] = useState('');
  
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, percentage: 0 });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOffline(!state.isConnected));
    return () => unsubscribe();
  }, []);

  const fetchShorts = async (count = 2, retries = 0) => {
    if (isLoadingMore || isOffline) return;
    setIsLoadingMore(true);
    try {
        const res = await fetch(`${MY_API_SERVER}/api/get-shorts?count=${count}`);
        const data = await res.json();
        
        if (data.success && data.shorts && data.shorts.length > 0) {
            setShortsList(prev => {
                const newShorts = data.shorts.filter(s => !prev.find(p => p.videoId === s.videoId));
                return [...prev, ...newShorts];
            });
        } else if (retries < 5) {
            setTimeout(() => {
                setIsLoadingMore(false);
                fetchShorts(count, retries + 1);
            }, 1000);
            return;
        }
    } catch (e) {}
    setIsLoadingMore(false);
  };

  const loadDownloadedData = async () => {
    try {
        let saved = await AsyncStorage.getItem('permanent_shorts');
        let parsed = saved ? JSON.parse(saved) : [];
        const validList = [];
        for (const item of parsed) {
            const fileInfo = await FileSystem.getInfoAsync(item.uri);
            if(fileInfo.exists) validList.push(item);
        }
        setDownloadedShorts(validList);
        if (validList.length !== parsed.length) await AsyncStorage.setItem('permanent_shorts', JSON.stringify(validList));
    } catch (e) {}
  };

  useFocusEffect(useCallback(() => { if (isOffline) loadDownloadedData(); }, [isOffline]));

  useEffect(() => {
    const initId = initialVideoId || route?.params?.videoId;
    
    const startApp = async () => {
        if (initId && !isOffline) {
            try {
                // [FIXED]: প্রথম ভিডিওটি ২ সেকেন্ডে আনার জন্য Fast API
                const fastRes = await fetch(`${MY_API_SERVER}/api/fast-short?id=${initId}`);
                const fastData = await fastRes.json();
                if (fastData.success) {
                    setShortsList([fastData.short]);
                }
            } catch(e) {}
        }
        if (!isOffline) fetchShorts(2); 
    };
    
    startApp();
    loadDownloadedData();
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
        setVisibleIndex(viewableItems[0].index);
        if (!isOffline && viewableItems[0].index >= shortsList.length - 2) fetchShorts(3);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // [FIXED]: App-Side Download (Fastest)
  const startBulkDownload = async (targetCount) => {
    if (!targetCount || isNaN(targetCount) || targetCount <= 0) return;
    setShowDownloadModal(false);
    setIsBulkDownloading(true);
    setBulkProgress({ current: 0, total: targetCount, percentage: 0 });

    let downloaded = 0;
    let saved = await AsyncStorage.getItem('permanent_shorts');
    let parsed = saved ? JSON.parse(saved) : [];

    while (downloaded < targetCount) {
        try {
            const res = await fetch(`${MY_API_SERVER}/api/get-shorts?count=1`);
            const data = await res.json();

            if (data.success && data.shorts.length > 0) {
                const item = data.shorts[0];
                if (parsed.some(s => s.videoId === item.videoId)) continue;

                const fileUri = FileSystem.documentDirectory + `perm_${item.videoId}.mp4`;
                const downloadResumable = FileSystem.createDownloadResumable(
                    item.downloadUrl || item.url, // ২৪০p লিংক ব্যবহার করে দ্রুত ডাউনলোড
                    fileUri, {},
                    (p) => {
                        const progress = Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100);
                        setBulkProgress({ current: downloaded + 1, total: targetCount, percentage: progress });
                    }
                );

                const dlResult = await downloadResumable.downloadAsync();
                if (dlResult.status === 200) {
                    parsed.push({ ...item, uri: dlResult.uri, isPermanent: true });
                    downloaded++;
                    await AsyncStorage.setItem('permanent_shorts', JSON.stringify(parsed));
                }
            } else {
                await new Promise(r => setTimeout(r, 1500));
            }
        } catch (e) { break; }
    }
    setIsBulkDownloading(false);
    Alert.alert("সফল", `${downloaded} টি শর্টস অফলাইনের জন্য সেভ হয়েছে।`);
  };

  const deleteDownloads = async () => {
      try {
          let saved = await AsyncStorage.getItem('permanent_shorts');
          let parsed = saved ? JSON.parse(saved) : [];
          for(const item of parsed) {
              try { await FileSystem.deleteAsync(item.uri, {idempotent: true}); } catch(e){}
          }
          await AsyncStorage.removeItem('permanent_shorts');
          setDownloadedShorts([]);
          setShowSettingsModal(false);
          Alert.alert("সফল", "সব ডাউনলোড মুছে ফেলা হয়েছে।");
      } catch(e){}
  };
const renderItem = ({ item, index }) => {
      const isPlaying = index === visibleIndex && isFocused;
      const videoUri = isOffline ? item.uri : item.url;
      
      return (
          <View style={styles.shortContainer}>
              <Video 
                  source={{ uri: videoUri }}
                  style={StyleSheet.absoluteFill}
                  shouldPlay={isPlaying}
                  isLooping
                  resizeMode="contain" 
                  useNativeControls={false}
              />
              
              <View style={styles.overlay}>
                  <View style={styles.topHeader}>
                      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                          <Ionicons name="arrow-back" size={28} color="#FFF" />
                      </TouchableOpacity>
                      
                      <View style={styles.topRightActions}>
                          {!isOffline && (
                              <TouchableOpacity style={styles.topActionBtn} onPress={() => setShowDownloadModal(true)}>
                                  <Ionicons name="cloud-download-outline" size={24} color="#FFF" />
                                  <Text style={styles.topActionText}>Download</Text>
                              </TouchableOpacity>
                          )}
                          <TouchableOpacity style={styles.topActionBtn} onPress={() => setShowSettingsModal(true)}>
                              <Ionicons name="settings-outline" size={24} color="#FFF" />
                          </TouchableOpacity>
                      </View>
                  </View>

                  <View style={styles.bottomSection}>
                      <View style={styles.infoCol}>
                          <View style={styles.channelRow}>
                              <Image source={{ uri: item.thumbnail }} style={styles.channelAvatar} />
                              <Text style={styles.channelText}>@{item.channel}</Text>
                              {item.isPermanent && (
                                  <View style={styles.offlineBadge}><Text style={styles.offlineBadgeText}>Saved</Text></View>
                              )}
                          </View>
                          <Text style={styles.titleText} numberOfLines={3}>{item.title}</Text>
                      </View>
                      
                      <View style={styles.actionCol}>
                          <TouchableOpacity style={styles.actionBtn}>
                              <Ionicons name="heart" size={32} color="#FFF" />
                              <Text style={styles.actionLabel}>Like</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.actionBtn}>
                              <Ionicons name="chatbubble" size={30} color="#FFF" />
                              <Text style={styles.actionLabel}>Comment</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.actionBtn}>
                              <Ionicons name="arrow-redo" size={32} color="#FFF" />
                              <Text style={styles.actionLabel}>Share</Text>
                          </TouchableOpacity>
                      </View>
                  </View>
              </View>
          </View>
      );
  };

  const downloadOptions = [10, 20, 30, 40, 50, 100, 150, 200];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="transparent" translucent barStyle="light-content" />

      {isBulkDownloading && (
          <View style={styles.progressToast}>
              <ActivityIndicator size="small" color="#FFF" style={{marginRight: 10}}/>
              <Text style={styles.progressText}>
                 ডাউনলোড হচ্ছে... {bulkProgress.current} / {bulkProgress.total} ({bulkProgress.percentage}%)
              </Text>
          </View>
      )}

      {isOffline && downloadedShorts.length === 0 ? (
          <View style={styles.loadingContainer}>
              <Ionicons name="wifi-outline" size={80} color="#444" />
              <Text style={styles.loadingText}>কোনো ডাউনলোড করা ভিডিও নেই</Text>
          </View>
      ) : (!isOffline && shortsList.length === 0) ? (
          <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF0000" />
              <Text style={styles.loadingText}>ভিডিও প্রস্তুত হচ্ছে...</Text>
          </View>
      ) : (
          <FlatList
              data={isOffline ? downloadedShorts : shortsList}
              keyExtractor={(item, index) => (item.videoId || index).toString()}
              renderItem={renderItem}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              windowSize={3}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              removeClippedSubviews={true}
              bounces={false}
          />
      )}

      <Modal visible={showDownloadModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>অফলাইন ডাউনলোড</Text>
                  <Text style={styles.modalSub}>কতগুলো শর্টস ডাউনলোড করতে চান?</Text>
                  <View style={styles.customInputRow}>
                      <TextInput style={styles.customInput} placeholder="সংখ্যা লিখুন (উদাঃ ২৫)" placeholderTextColor="#666" keyboardType="numeric" value={customCount} onChangeText={setCustomCount}/>
                      <TouchableOpacity style={styles.customBtn} onPress={() => startBulkDownload(parseInt(customCount))}><Text style={styles.customBtnText}>শুরু</Text></TouchableOpacity>
                  </View>
                  <FlatList data={downloadOptions} numColumns={4} keyExtractor={i => i.toString()} renderItem={({item}) => (
                      <TouchableOpacity style={styles.gridBtn} onPress={() => startBulkDownload(item)}><Text style={styles.gridBtnText}>{item}</Text></TouchableOpacity>
                  )}/>
                  <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowDownloadModal(false)}><Text style={styles.closeModalText}>বাতিল</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showSettingsModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>সেটিংস</Text>
                  <TouchableOpacity style={styles.deleteOptionBtn} onPress={deleteDownloads}>
                      <Ionicons name="trash-bin-outline" size={24} color="#FF4444" />
                      <View style={{marginLeft: 15}}><Text style={styles.deleteTitle}>সব ডাউনলোড মুছুন</Text></View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowSettingsModal(false)}><Text style={styles.closeModalText}>বন্ধ করুন</Text></TouchableOpacity>
              </View>
          </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  loadingText: { color: '#FFF', fontSize: 16, marginTop: 15, fontWeight: 'bold' },
  progressToast: { position: 'absolute', top: 50, left: 20, right: 20, backgroundColor: 'rgba(0, 191, 165, 0.9)', padding: 12, borderRadius: 25, zIndex: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  progressText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  shortContainer: { width: width, height: height, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingTop: 40 },
  backBtn: { padding: 5 },
  topRightActions: { flexDirection: 'row', alignItems: 'center' },
  topActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginLeft: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  topActionText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 5 },
  bottomSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 15, paddingBottom: 80 },
  infoCol: { flex: 1, paddingRight: 20 },
  channelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#333' },
  channelText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginHorizontal: 10 },
  offlineBadge: { backgroundColor: '#00BFA5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  offlineBadgeText: { color: '#000', fontSize: 10, fontWeight: 'bold' },
  titleText: { color: '#FFF', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3 },
  actionCol: { alignItems: 'center' },
  actionBtn: { alignItems: 'center', marginBottom: 20 },
  actionLabel: { color: '#FFF', fontSize: 12, marginTop: 5 },
  musicThumb: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#333', marginTop: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1A1A1A', width: '85%', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  modalSub: { color: '#888', fontSize: 13, marginBottom: 20 },
  customInputRow: { flexDirection: 'row', width: '100%', marginBottom: 20 },
  customInput: { flex: 1, backgroundColor: '#000', color: '#FFF', paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', height: 45 },
  customBtn: { backgroundColor: '#00BFA5', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 10, marginLeft: 10 },
  customBtnText: { color: '#000', fontWeight: 'bold' },
  gridBtn: { backgroundColor: '#2A2A2A', width: '21%', margin: '2%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#444' },
  gridBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  deleteOptionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', width: '100%', padding: 15, borderRadius: 12, marginBottom: 15 },
  deleteTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  closeModalBtn: { marginTop: 15, width: '100%', alignItems: 'center' },
  closeModalText: { color: '#FF4444', fontSize: 16, fontWeight: 'bold' }
});