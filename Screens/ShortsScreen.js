import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, FlatList, SafeAreaView, StatusBar, Image, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused, useFocusEffect } from '@react-navigation/native';
import { Video } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo'; // [NEW]: প্রফেশনাল নেটওয়ার্ক ডিটেকশন

const { width, height } = Dimensions.get('window');
const MY_API_SERVER = "http://127.0.0.1:10000"; 
const TEMP_CACHE_LIMIT = 43200000; // ১২ ঘণ্টা

export default function ShortsScreen({ initialVideoId, route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [shortsList, setShortsList] = useState([]);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [isOffline, setIsOffline] = useState(false);
  const [mergedOfflineShorts, setMergedOfflineShorts] = useState([]);

  // Modals & Download State
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customCount, setCustomCount] = useState('');
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);

  // [NEW]: নেটওয়ার্ক রিয়েল-টাইম মনিটরিং
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const fetchShorts = async (count = 1, retries = 0) => {
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
            }, 2000);
            return;
        }
    } catch (e) {
        console.log("Fetch error, server might be busy.");
    }
    setIsLoadingMore(false);
  };

  const loadOfflineData = async () => {
    try {
        const now = Date.now();
        let tempSaved = await AsyncStorage.getItem('temp_cached_shorts');
        let permSaved = await AsyncStorage.getItem('permanent_shorts');
        
        let tempParsed = tempSaved ? JSON.parse(tempSaved) : [];
        let permParsed = permSaved ? JSON.parse(permSaved) : [];

        const validTemp = [];
        for (const item of tempParsed) {
            if (now - item.timestamp <= TEMP_CACHE_LIMIT) {
                validTemp.push(item);
            }
        }
        if (validTemp.length !== tempParsed.length) await AsyncStorage.setItem('temp_cached_shorts', JSON.stringify(validTemp));

        setMergedOfflineShorts([...permParsed, ...validTemp]);
    } catch (e) {}
  };

  useFocusEffect(
    useCallback(() => {
        if (isOffline) loadOfflineData();
    }, [isOffline])
  );

  useEffect(() => {
    const initId = initialVideoId || route?.params?.videoId;
    const initializeFeed = async () => {
        try {
            if (initId && !isOffline) await fetch(`${MY_API_SERVER}/api/add-shorts?ids=${initId}`);
            if (!isOffline) fetchShorts(3); 
        } catch(e) {}
    };
    initializeFeed();
    loadOfflineData();
  }, []);

  // [UPDATED]: সার্ভার-সাইড ক্যাশিং
  const cacheVideoTemporarily = async (item) => {
    try {
        let tempSaved = await AsyncStorage.getItem('temp_cached_shorts');
        let parsed = tempSaved ? JSON.parse(tempSaved) : [];
        if (parsed.some(s => s.videoId === item.videoId)) return;

        // সার্ভারকে ডাউনলোড করতে বলা হচ্ছে (ব্যাকগ্রাউন্ডে হবে)
        const res = await fetch(`${MY_API_SERVER}/api/download-short-bg?id=${item.videoId}&type=temp`);
        const data = await res.json();

        if (data.success && data.localUrl) {
            parsed.push({ ...item, uri: data.localUrl, timestamp: Date.now() });
            if (parsed.length > 50) parsed.shift(); // মেমোরি কন্ট্রোল
            await AsyncStorage.setItem('temp_cached_shorts', JSON.stringify(parsed));
        }
    } catch(e) {}
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
        const index = viewableItems[0].index;
        setVisibleIndex(index);
        
        if (!isOffline && shortsList[index]) {
            cacheVideoTemporarily(shortsList[index]);
        }

        if (!isOffline && index > 0 && index >= shortsList.length - 2) {
            fetchShorts(2);
        }
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // [UPDATED]: সার্ভার-সাইড বাল্ক ডাউনলোড (ফাস্ট এবং রিলায়েবল)
  const startBulkDownload = async (targetCount) => {
    if (!targetCount || isNaN(targetCount) || targetCount <= 0) return;
    setShowDownloadModal(false);
    setIsBulkDownloading(true);

    let downloaded = 0;
    let permSaved = await AsyncStorage.getItem('permanent_shorts');
    let permParsed = permSaved ? JSON.parse(permSaved) : [];

    Alert.alert("ডাউনলোড শুরু হয়েছে", "সার্ভার ব্যাকগ্রাউন্ডে ভিডিওগুলো সেভ করছে।");

    while (downloaded < targetCount) {
        try {
            const batchSize = Math.min(5, targetCount - downloaded);
            const res = await fetch(`${MY_API_SERVER}/api/get-shorts?count=${batchSize}`);
            const data = await res.json();

            if (data.success && data.shorts.length > 0) {
                for (const item of data.shorts) {
                    if (permParsed.some(s => s.videoId === item.videoId)) continue;

                    // সার্ভারকে ভিডিওটি পার্মানেন্টলি সেভ করতে বলা হলো
                    const dlRes = await fetch(`${MY_API_SERVER}/api/download-short-bg?id=${item.videoId}&type=perm`);
                    const dlData = await dlRes.json();
                    
                    if (dlData.success && dlData.localUrl) {
                        permParsed.push({ ...item, uri: dlData.localUrl, isPermanent: true });
                        downloaded++;
                        await AsyncStorage.setItem('permanent_shorts', JSON.stringify(permParsed));
                    }
                }
            } else {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        } catch (e) {
            break;
        }
    }
    setIsBulkDownloading(false);
  };

  const clearDownloads = async (type) => {
      try {
          if (type === 'perm') {
              await AsyncStorage.removeItem('permanent_shorts');
              Alert.alert("সফল", "ডাউনলোড করা সব ভিডিও মুছে ফেলা হয়েছে। (সার্ভারের ফোল্ডার থেকেও মুছে দিন)");
          } else {
              await AsyncStorage.removeItem('temp_cached_shorts');
              Alert.alert("সফল", "১২ ঘণ্টার প্লে-হিস্ট্রি ক্যাশ মুছে ফেলা হয়েছে।");
          }
          setShowSettingsModal(false);
          loadOfflineData();
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
                  resizeMode="cover"
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
                              {isOffline && item.isPermanent && (
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
                          <TouchableOpacity style={styles.actionBtn}>
                              <Image source={{ uri: item.thumbnail }} style={styles.musicThumb} />
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

      {isOffline && mergedOfflineShorts.length === 0 ? (
          <View style={styles.loadingContainer}>
              <Ionicons name="wifi-outline" size={80} color="#444" />
              <Text style={styles.loadingText}>অফলাইন ভিডিও নেই</Text>
              <Text style={styles.loadingSubText}>ইন্টারনেট চালু করুন</Text>
          </View>
      ) : (!isOffline && shortsList.length === 0) ? (
          <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF0000" />
              <Text style={styles.loadingText}>ভিডিও প্রস্তুত হচ্ছে...</Text>
          </View>
      ) : (
          <FlatList
              data={isOffline ? mergedOfflineShorts : shortsList}
              keyExtractor={(item, index) => (item.videoId || item.id) + index.toString()}
              renderItem={renderItem}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              bounces={false}
              windowSize={3}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
          />
      )}

      <Modal visible={showDownloadModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Offline Download</Text>
                  <Text style={styles.modalSub}>Select number of shorts to download</Text>
                  
                  <View style={styles.customInputRow}>
                      <TextInput 
                          style={styles.customInput} 
                          placeholder="Custom Number (e.g. 25)" 
                          placeholderTextColor="#666"
                          keyboardType="numeric"
                          value={customCount}
                          onChangeText={setCustomCount}
                      />
                      <TouchableOpacity style={styles.customBtn} onPress={() => startBulkDownload(parseInt(customCount))}>
                          <Text style={styles.customBtnText}>Start</Text>
                      </TouchableOpacity>
                  </View>
                  
                  <FlatList 
                      data={downloadOptions}
                      numColumns={4}
                      keyExtractor={item => item.toString()}
                      renderItem={({item}) => (
                          <TouchableOpacity style={styles.gridBtn} onPress={() => startBulkDownload(item)}>
                              <Text style={styles.gridBtnText}>{item}</Text>
                          </TouchableOpacity>
                      )}
                  />
                  
                  <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowDownloadModal(false)}>
                      <Text style={styles.closeModalText}>Cancel</Text>
                  </TouchableOpacity>
              </View>
          </View>
      </Modal>

      <Modal visible={showSettingsModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Shorts Settings</Text>
                  
                  <TouchableOpacity style={styles.deleteOptionBtn} onPress={() => clearDownloads('perm')}>
                      <Ionicons name="trash-bin-outline" size={24} color="#FF4444" />
                      <View style={{marginLeft: 15}}>
                          <Text style={styles.deleteTitle}>Delete Permanent Downloads</Text>
                          <Text style={styles.deleteSub}>Clear videos downloaded via button</Text>
                      </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.deleteOptionBtn} onPress={() => clearDownloads('temp')}>
                      <Ionicons name="time-outline" size={24} color="#FF9800" />
                      <View style={{marginLeft: 15}}>
                          <Text style={styles.deleteTitle}>Clear 12h Cache</Text>
                          <Text style={styles.deleteSub}>Clear auto-saved watched videos</Text>
                      </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowSettingsModal(false)}>
                      <Text style={styles.closeModalText}>Close</Text>
                  </TouchableOpacity>
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
  loadingSubText: { color: '#AAA', fontSize: 12, marginTop: 5 },
  
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
  channelAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#333', borderWidth: 1, borderColor: '#FFF' },
  channelText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginHorizontal: 10, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  offlineBadge: { backgroundColor: '#00BFA5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  offlineBadgeText: { color: '#000', fontSize: 10, fontWeight: 'bold' },
  titleText: { color: '#FFF', fontSize: 14, lineHeight: 20, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  
  actionCol: { alignItems: 'center' },
  actionBtn: { alignItems: 'center', marginBottom: 20 },
  actionLabel: { color: '#FFF', fontSize: 12, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  musicThumb: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#333', marginTop: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#1A1A1A', width: '85%', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  modalSub: { color: '#888', fontSize: 13, marginBottom: 20 },
  
  customInputRow: { flexDirection: 'row', width: '100%', marginBottom: 20 },
  customInput: { flex: 1, backgroundColor: '#000', color: '#FFF', paddingHorizontal: 15, borderRadius: 10, borderWidth: 1, borderColor: '#333', height: 45 },
  customBtn: { backgroundColor: '#00BFA5', justifyContent: 'center', paddingHorizontal: 20, borderRadius: 10, marginLeft: 10 },
  customBtnText: { color: '#000', fontWeight: 'bold' },

  gridBtn: { backgroundColor: '#2A2A2A', width: '21%', margin: '2%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#444' },
  gridBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  
  deleteOptionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2A', width: '100%', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#444' },
  deleteTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  deleteSub: { color: '#888', fontSize: 12, marginTop: 2 },

  closeModalBtn: { marginTop: 15, paddingVertical: 10, width: '100%', alignItems: 'center' },
  closeModalText: { color: '#FF4444', fontSize: 16, fontWeight: 'bold' }
});