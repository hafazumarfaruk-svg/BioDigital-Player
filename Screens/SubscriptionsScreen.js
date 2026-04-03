import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SubscriptionsScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused(); 
  
  const [subscribedChannels, setSubscribedChannels] = useState([]);
  const [thumbQuality, setThumbQuality] = useState('High');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isFocused) {
      loadSettingsAndSubs();
    }
  }, [isFocused]);

  const loadSettingsAndSubs = async () => {
    setLoading(true);
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      if (subs) setSubscribedChannels(JSON.parse(subs));
      
      const quality = await AsyncStorage.getItem('thumbnailQuality');
      if (quality) setThumbQuality(quality);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = (channelId, channelName) => {
    Alert.alert(
      "Unsubscribe",
      `Are you sure you want to unsubscribe from '${channelName}'?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Unsubscribe", 
          style: "destructive",
          onPress: async () => {
            try {
              const updatedSubs = subscribedChannels.filter(sub => sub.id !== channelId);
              setSubscribedChannels(updatedSubs);
              await AsyncStorage.setItem('subscribedChannels', JSON.stringify(updatedSubs));
            } catch (e) { console.log(e); }
          }
        }
      ]
    );
  };

  const toggleThumbnailQuality = async () => {
    const newQuality = thumbQuality === 'High' ? 'Data Saver' : 'High';
    setThumbQuality(newQuality);
    await AsyncStorage.setItem('thumbnailQuality', newQuality);
    Alert.alert("Success", `Thumbnail quality set to: ${newQuality}`);
  };

  const renderItem = ({ item }) => (
    <View style={styles.subItemCard}>
      <TouchableOpacity 
        style={styles.subInfo} 
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Channel', { channelName: item.name, channelAvatar: item.avatar })}
      >
        <Image source={{ uri: item.avatar || 'https://via.placeholder.com/150' }} style={styles.subAvatar} />
        <Text style={styles.subNameText} numberOfLines={1}>{item.name}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.unsubBtn} onPress={() => handleUnsubscribe(item.id, item.name)}>
        <Text style={styles.unsubBtnText}>Unsubscribe</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Subscriptions</Text>
      </View>

      {/* --- ADDED: Thumbnail Quality Controller --- */}
      <View style={styles.controlPanel}>
         <Text style={styles.controlTitle}>Thumbnail Quality Control</Text>
         <TouchableOpacity style={styles.qualityBtn} onPress={toggleThumbnailQuality}>
            <Ionicons name={thumbQuality === 'High' ? "image" : "image-outline"} size={20} color="#FFF" />
            <Text style={styles.qualityText}>Current: {thumbQuality}</Text>
         </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContent}><ActivityIndicator size="large" color="#FF0000" /></View>
      ) : subscribedChannels.length === 0 ? (
        <View style={styles.centerContent}>
          <Ionicons name="notifications-off-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>You haven't subscribed to any channel yet.</Text>
        </View>
      ) : (
        <FlatList 
          data={subscribedChannels} 
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 10 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  header: { flexDirection: 'row', alignItems: 'center', height: 55, borderBottomWidth: 1, borderBottomColor: '#222' },
  headerTitle: { flex: 1, color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  controlPanel: { padding: 15, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  controlTitle: { color: '#AAA', fontSize: 14, fontWeight: 'bold' },
  qualityBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  qualityText: { color: '#FFF', fontSize: 12, marginLeft: 5, fontWeight: 'bold' },
  subItemCard: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#1A1A1A', marginBottom: 10, borderRadius: 10 },
  subInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  subAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15, backgroundColor: '#333' },
  subNameText: { flex: 1, color: '#FFF', fontSize: 16, fontWeight: '500', paddingRight: 10 },
  unsubBtn: { backgroundColor: '#333', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  unsubBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#888', marginTop: 15, fontSize: 14, textAlign: 'center', paddingHorizontal: 20 }
});