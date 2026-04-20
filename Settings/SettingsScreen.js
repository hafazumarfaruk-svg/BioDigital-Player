import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

global.appSettings = global.appSettings || {};
global.appSettings.normalVideo = global.appSettings.normalVideo || 'Auto'; 
// ডিফল্ট শর্টস কোয়ালিটি
global.shortVideoQuality = global.shortVideoQuality || 'Normal Video Quality';
global.appSettings.downloadLocation = global.appSettings.downloadLocation || '/storage/emulated/0/MyTube';
global.appSettings.shortsCacheLimit = global.appSettings.shortsCacheLimit || 3600000;

const MY_API_SERVER = "http://127.0.0.1:10000";

export default function SettingsScreen() {
  const [isMainQualityExpanded, setIsMainQualityExpanded] = useState(false);
  const [selectedMainQuality, setSelectedMainQuality] = useState(global.appSettings.normalVideo);

  const [isShortQualityExpanded, setIsShortQualityExpanded] = useState(false);
  const [selectedShortQuality, setSelectedShortQuality] = useState(global.shortVideoQuality);

  const [isLocationExpanded, setIsLocationExpanded] = useState(false);
  const [downloadLocations, setDownloadLocations] = useState([{ label: 'Phone Memory', path: '/storage/emulated/0/MyTube' }]);
  const [selectedLocation, setSelectedLocation] = useState(global.appSettings.downloadLocation);

  const [isCacheLimitExpanded, setIsCacheLimitExpanded] = useState(false);
  const [selectedCacheLimit, setSelectedCacheLimit] = useState(global.appSettings.shortsCacheLimit);

  const [isLoading, setIsLoading] = useState(false);

  // [NEW]: অ্যাপ চালু হলে বা সেটিংসে ঢুকলে সেভ করা শর্টস কোয়ালিটি লোড করবে
  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const savedShortQuality = await AsyncStorage.getItem('shortVideoQuality');
        if (savedShortQuality) {
          global.shortVideoQuality = savedShortQuality;
          setSelectedShortQuality(savedShortQuality);
        }
      } catch (e) {
        console.log(e);
      }
    };
    
    loadSavedSettings();

    // স্টোরেজ লোকেশন লোড
    fetch(`${MY_API_SERVER}/api/storage-info`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDownloadLocations(data.storages);
          setSelectedLocation(data.current);
        }
      }).catch(e => console.log(e));
  }, []);

  const longVideoOptions = [
      'Auto', '75p', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p (2K)', '2160p (4K)', '4320p (8K)'
  ];

  const shortVideoOptions = [
      'Anti Data Saver Mode', 'Low Video Quality', 'Normal Video Quality', 'High Video Quality 4k-8k'
  ];

  const cacheLimitOptions = [
      { label: '30 Minutes', value: 1800000 },
      { label: '1 Hour (Default)', value: 3600000 },
      { label: '2 Hours', value: 7200000 },
      { label: '3 Hours', value: 10800000 },
      { label: '6 Hours', value: 21600000 },
      { label: '12 Hours', value: 43200000 },
      { label: '24 Hours', value: 86400000 }
  ];

  // লং ভিডিওর কোয়ালিটি (আপনার আগের লজিক অপরিবর্তিত রাখা হয়েছে)
  const handleMainQualitySelect = (res) => {
    setIsLoading(true); 
    setTimeout(() => {
      global.appSettings.normalVideo = res; 
      setSelectedMainQuality(res);
      DeviceEventEmitter.emit('qualityChanged', res);
      setIsLoading(false); 
    }, 800);
  };

  // [UPDATED]: শর্টস কোয়ালিটি সিলেক্ট করলে গ্লোবাল ভেরিয়েবলের পাশাপাশি স্টোরেজে সেভ হবে
  const handleShortQualitySelect = async (res) => {
    setIsLoading(true); 
    try {
      // ১. গ্লোবাল ভেরিয়েবল আপডেট
      global.shortVideoQuality = res; 
      // ২. UI আপডেট
      setSelectedShortQuality(res);
      // ৩. পার্মানেন্ট সেভ (যাতে অ্যাপ রিস্টার্ট দিলেও মনে রাখে)
      await AsyncStorage.setItem('shortVideoQuality', res); 
    } catch (e) {}
    
    setTimeout(() => setIsLoading(false), 800);
  };

  const handleLocationSelect = (path) => {
    setIsLoading(true);
    setTimeout(() => {
      fetch(`${MY_API_SERVER}/api/set-download-location?path=${encodeURIComponent(path)}`)
        .then(() => {
          global.appSettings.downloadLocation = path;
          setSelectedLocation(path);
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));
    }, 800);
  };

  const handleCacheLimitSelect = (val) => {
    setIsLoading(true);
    setTimeout(() => {
      global.appSettings.shortsCacheLimit = val;
      setSelectedCacheLimit(val);
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

          <ExpandableMenu 
            icon="tv-outline" label="Long Video Quality" 
            expanded={isMainQualityExpanded} onPress={() => setIsMainQualityExpanded(!isMainQualityExpanded)} 
          />
          {isMainQualityExpanded && (
            <View style={styles.radioGroup}>
              {longVideoOptions.map((opt, index) => (
                <QualityRadioOption key={index} label={opt} selected={selectedMainQuality === opt} onPress={() => handleMainQualitySelect(opt)} />
              ))}
            </View>
          )}

          <ExpandableMenu 
            icon="phone-portrait-outline" label="Shorts Video Quality" 
            expanded={isShortQualityExpanded} onPress={() => setIsShortQualityExpanded(!isShortQualityExpanded)} 
          />
          {isShortQualityExpanded && (
            <View style={styles.radioGroup}>
              {shortVideoOptions.map((opt, index) => (
                <QualityRadioOption key={index} label={opt} selected={selectedShortQuality === opt} onPress={() => handleShortQualitySelect(opt)} />
              ))}
            </View>
          )}

          <ExpandableMenu 
            icon="folder-open-outline" label="Download Location" 
            expanded={isLocationExpanded} onPress={() => setIsLocationExpanded(!isLocationExpanded)} 
          />
          {isLocationExpanded && (
            <View style={styles.radioGroup}>
              {downloadLocations.map((loc, index) => (
                <QualityRadioOption key={index} label={loc.label} selected={selectedLocation === loc.path} onPress={() => handleLocationSelect(loc.path)} />
              ))}
            </View>
          )}

          <ExpandableMenu 
            icon="time-outline" label="Shorts Video Cache Limit Time" 
            expanded={isCacheLimitExpanded} onPress={() => setIsCacheLimitExpanded(!isCacheLimitExpanded)} 
          />
          {isCacheLimitExpanded && (
            <View style={styles.radioGroup}>
              {cacheLimitOptions.map((opt, index) => (
                <QualityRadioOption key={index} label={opt.label} selected={selectedCacheLimit === opt.value} onPress={() => handleCacheLimitSelect(opt.value)} />
              ))}
            </View>
          )}

        </View>
      </ScrollView>

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.loadingText}>Applying Settings...</Text>
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