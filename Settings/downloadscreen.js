import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';

export default function DownloadScreen({ navigation }) {
  const [downloads, setDownloads] = useState([]);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) loadDownloads();
  }, [isFocused]);

  const loadDownloads = async () => {
    try {
      const data = await AsyncStorage.getItem('recorded_downloads');
      if (data) setDownloads(JSON.parse(data));
    } catch (e) { console.error(e); }
  };

  const deleteDownload = async (id) => {
    Alert.alert("মুছে ফেলুন", "আপনি কি এই ডাউনলোডের রেকর্ডটি মুছে ফেলতে চান?", [
      { text: "না" },
      { text: "হ্যাঁ", onPress: async () => {
          const newList = downloads.filter(item => item.id !== id);
          setDownloads(newList);
          await AsyncStorage.setItem('recorded_downloads', JSON.stringify(newList));
        }
      }
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {/* [FIX]: Linking.openURL এর পরিবর্তে লোকাল প্লেব্যাক ইঞ্জিন (GlobalPlayer) ব্যবহার করার জন্য নেভিগেশন আপডেট করা হলো */}
      <TouchableOpacity 
        style={styles.cardMain} 
        activeOpacity={0.8} 
        onPress={() => {
          navigation.navigate('Player', {
            videoId: item.videoId,
            videoData: {
              id: item.videoId,
              title: item.title,
              channel: 'Downloaded File',
              thumbnail: item.thumbnail,
              localUri: item.localUri || item.url // গ্লোবাল প্লেয়ারকে সিগন্যাল দেওয়া হচ্ছে এটি লোকাল ফাইল
            }
          });
        }}
      >
        <Image source={{ uri: item.thumbnail }} style={styles.thumb} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.meta}>{item.quality} • {item.type.toUpperCase()} • {item.date}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteDownload(item.id)}>
        <Ionicons name="trash-outline" size={22} color="#FF4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ডাউনলোডসমূহ</Text>
      </View>

      <FlatList 
        data={downloads}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="download-outline" size={80} color="#333" />
            <Text style={styles.emptyText}>কোনো ডাউনলোড পাওয়া যায়নি</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  backBtn: { marginRight: 15 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  list: { padding: 10 },
  card: { flexDirection: 'row', backgroundColor: '#1A1A1A', borderRadius: 10, marginBottom: 12, overflow: 'hidden', alignItems: 'center' },
  cardMain: { flex: 1, flexDirection: 'row', padding: 10 },
  thumb: { width: 120, height: 68, borderRadius: 6, backgroundColor: '#333' },
  info: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  title: { color: '#FFF', fontSize: 14, fontWeight: '500', marginBottom: 4 },
  meta: { color: '#AAA', fontSize: 12 },
  deleteBtn: { padding: 15 },
  empty: { flex: 1, marginTop: 100, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#555', fontSize: 16, marginTop: 15 }
});