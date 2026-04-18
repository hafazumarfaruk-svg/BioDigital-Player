import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions, FlatList, SafeAreaView, StatusBar, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Video } from 'expo-av';

const { width, height } = Dimensions.get('window');
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function ShortsScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [shortsList, setShortsList] = useState([]);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // সার্ভার থেকে শর্টস কল করে আনার ফাংশন
  const fetchShorts = async (count = 1) => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
        const res = await fetch(`${MY_API_SERVER}/api/get-shorts?count=${count}`);
        const data = await res.json();
        
        if (data.success && data.shorts.length > 0) {
            setShortsList(prev => [...prev, ...data.shorts]);
        }
    } catch (e) {
        console.log("Error fetching shorts from buffer", e);
    }
    setIsLoadingMore(false);
  };

  useEffect(() => {
    // স্ক্রিন ওপেন হওয়ার সাথে সাথে ৩টি শর্টস নিয়ে আসবে
    fetchShorts(3); 
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
        const index = viewableItems[0].index;
        setVisibleIndex(index);
        
        // [LOGIC]: একটি শর্টস পার হলেই নতুন আরেকটি শর্টস সার্ভার থেকে এনে নিচে যোগ করবে
        if (index > 0) {
            fetchShorts(1);
        }
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const renderItem = ({ item, index }) => {
      const isPlaying = index === visibleIndex && isFocused;
      
      return (
          <View style={styles.shortContainer}>
              {/* Native Video Player */}
              <Video 
                  source={{ uri: item.url }}
                  style={StyleSheet.absoluteFill}
                  shouldPlay={isPlaying}
                  isLooping
                  resizeMode="cover"
                  useNativeControls={false}
              />
              
              {/* ওভারলে UI (TikTok/Shorts স্টাইল) */}
              <View style={styles.overlay}>
                  <View style={styles.topHeader}>
                      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                          <Ionicons name="arrow-back" size={28} color="#FFF" />
                      </TouchableOpacity>
                      <Text style={styles.headerTitle}>Shorts</Text>
                      <View style={{ width: 28 }} />
                  </View>

                  <View style={styles.bottomSection}>
                      <View style={styles.infoCol}>
                          <View style={styles.channelRow}>
                              <Image source={{ uri: item.thumbnail }} style={styles.channelAvatar} />
                              <Text style={styles.channelText}>@{item.channel}</Text>
                              <TouchableOpacity style={styles.subBtn}>
                                  <Text style={styles.subBtnText}>Subscribe</Text>
                              </TouchableOpacity>
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="transparent" translucent barStyle="light-content" />
      {shortsList.length === 0 ? (
          <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#FF0000" />
              <Text style={styles.loadingText}>সার্ভার থেকে ভিডিও আনা হচ্ছে...</Text>
              <Text style={styles.loadingSubText}>(সার্ভারে আইডি পাঠানো নিশ্চিত করুন)</Text>
          </View>
      ) : (
          <FlatList
              data={shortsList}
              keyExtractor={(item, index) => item.videoId + index.toString()}
              renderItem={renderItem}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              bounces={false}
          />
      )}
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
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 2 },
  
  bottomSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 15, paddingBottom: 80 },
  infoCol: { flex: 1, paddingRight: 20 },
  channelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#333', borderWidth: 1, borderColor: '#FFF' },
  channelText: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginHorizontal: 10, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  subBtn: { backgroundColor: '#FF0000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  subBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  titleText: { color: '#FFF', fontSize: 14, lineHeight: 20, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  
  actionCol: { alignItems: 'center' },
  actionBtn: { alignItems: 'center', marginBottom: 20 },
  actionLabel: { color: '#FFF', fontSize: 12, marginTop: 5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 3 },
  musicThumb: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#333', marginTop: 10 }
});