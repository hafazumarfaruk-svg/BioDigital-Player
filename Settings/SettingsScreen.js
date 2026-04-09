import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export default function SettingsScreen() {
  const [isMainQualityExpanded, setIsMainQualityExpanded] = useState(false);
  const [selectedMainQuality, setSelectedMainQuality] = useState('Auto'); // ডিফল্ট

  const [isShortQualityExpanded, setIsShortQualityExpanded] = useState(false);
  const [selectedShortQuality, setSelectedShortQuality] = useState('Normal Video Quality'); // ডিফল্ট

  const [isLoading, setIsLoading] = useState(false);

  // লং ভিডিওর জন্য স্পেসিফিক কোয়ালিটি অপশন
  const longVideoOptions = [
      'Auto',
      '75p',
      '144p', 
      '240p', 
      '360p', 
      '480p', 
      '720p', 
      '1080p',
      '1440p (2K)',
      '2160p (4K)',
      '4320p (8K)'
  ];

  // শর্টস ভিডিওর জন্য অপশনগুলো
  const shortVideoOptions = [
      'Anti Data Saver Mode', 
      'Low Video Quality', 
      'Normal Video Quality', 
      'High Video Quality 4k-8k'
  ];

  // [FIX]: অ্যাপ চালু হলে লোকাল স্টোরেজ থেকে পূর্বের সেভ করা সেটিং লোড করা
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await AsyncStorage.getItem('appSettings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          if (parsed.normalVideo) setSelectedMainQuality(parsed.normalVideo);
          if (parsed.shortVideoQuality) setSelectedShortQuality(parsed.shortVideoQuality);
        }
      } catch (e) {
        console.error("Settings Load Error:", e);
      }
    };
    loadSettings();
  }, []);

  // [FIX]: AsyncStorage এ সেভ করা এবং গ্লোবাল প্লেয়ারকে রিয়েল-টাইম সিগন্যাল পাঠানো
  const handleMainQualitySelect = async (res) => {
    setIsLoading(true); 
    try {
      const savedSettings = await AsyncStorage.getItem('appSettings');
      const parsed = savedSettings ? JSON.parse(savedSettings) : {};
      
      parsed.normalVideo = res;
      await AsyncStorage.setItem('appSettings', JSON.stringify(parsed));
      
      setSelectedMainQuality(res);
      
      // গ্লোবাল প্লেয়ারকে কোয়ালিটি পরিবর্তনের নির্দেশ দেওয়া
      DeviceEventEmitter.emit('qualityChanged', res);
    } catch (error) {
      console.error("Settings Save Error:", error);
    }

    setTimeout(() => {
      setIsLoading(false); 
    }, 800);
  };

  const handleShortQualitySelect = async (res) => {
    setIsLoading(true); 
    try {
      const savedSettings = await AsyncStorage.getItem('appSettings');
      const parsed = savedSettings ? JSON.parse(savedSettings) : {};
      
      parsed.shortVideoQuality = res;
      await AsyncStorage.setItem('appSettings', JSON.stringify(parsed));
      
      setSelectedShortQuality(res);
    } catch (error) {
      console.error("Settings Save Error:", error);
    }

    setTimeout(() => {
      setIsLoading(false); 
    }, 800);
  };

  const ExpandableMenu = ({ icon, label, expanded, onPress }) => (
    <TouchableOpacity style={styles.listItem} activeOpacity={0.7} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icon} size={24} color="#FFF" style={{ marginRight: 15 }} />
        <Text style={styles.listText}>{label}</Text>
      </View>
      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#AAA" />
    </TouchableOpacity>
  );

  const QualityRadioOption = ({ label, selected, onPress }) => (
    <TouchableOpacity style={styles.radioRow} activeOpacity={0.7} onPress={onPress}>
      <Text style={[styles.radioText, selected && styles.activeRadioText]}>{label}</Text>
      <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? "#3EA6FF" : "#555"} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.listSection}>

          {/* লং ভিডিও কোয়ালিটি */}
          <ExpandableMenu 
            icon="tv-outline" label="Long Video Quality" 
            expanded={isMainQualityExpanded} onPress={() => setIsMainQualityExpanded(!isMainQualityExpanded)} 
          />
          {isMainQualityExpanded && (
            <View style={styles.radioGroup}>
              {longVideoOptions.map((opt, index) => (
                <QualityRadioOption 
                  key={index} label={opt} selected={selectedMainQuality === opt} onPress={() => handleMainQualitySelect(opt)}
                />
              ))}
            </View>
          )}

          {/* শর্টস ভিডিও কোয়ালিটি */}
          <ExpandableMenu 
            icon="phone-portrait-outline" label="Shorts Video Quality" 
            expanded={isShortQualityExpanded} onPress={() => setIsShortQualityExpanded(!isShortQualityExpanded)} 
          />
          {isShortQualityExpanded && (
            <View style={styles.radioGroup}>
              {shortVideoOptions.map((opt, index) => (
                <QualityRadioOption 
                  key={index} label={opt} selected={selectedShortQuality === opt} onPress={() => handleShortQualitySelect(opt)}
                />
              ))}
            </View>
          )}

        </View>
      </ScrollView>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.loadingText}>Applying Quality...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  scrollContent: { paddingTop: 20, paddingBottom: 30 }, 
  listSection: { paddingHorizontal: 10 },
  listItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 15 },
  listText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  radioGroup: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 15, marginBottom: 15, marginHorizontal: 15, borderWidth: 1, borderColor: '#222' },
  radioRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  radioText: { color: '#AAA', fontSize: 15 },
  activeRadioText: { color: '#3EA6FF', fontWeight: 'bold' },
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingBox: { backgroundColor: '#1E1E1E', padding: 25, borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  loadingText: { color: '#FFF', marginTop: 15, fontSize: 15, fontWeight: 'bold' }
});