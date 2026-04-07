import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// ==========================================
// ১. Screens ফোল্ডার থেকে ফাইল ইমপোর্ট
// ==========================================
import HomeScreen from './Screens/HomeScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlayerScreen from './Screens/PlayerScreen';
import PlaylistPage from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import SubscriptionsScreen from './Screens/SubscriptionsScreen';
import LiveScreen from './Screens/livescreen';

// ==========================================
// ২. Settings ফোল্ডার থেকে ফাইল ইমপোর্ট
// ==========================================
import SettingsScreen from './Settings/SettingsScreen';
import HistoryPage from './Settings/HistoryPage';
import DownloadScreen from './Settings/downloadscreen';
import SearchSetting from './Settings/searchsetting';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{
          headerShown: false, // ডিফল্ট হেডার লুকানোর জন্য
          cardStyle: { backgroundColor: '#000000' } // ডার্ক থিমের জন্য
        }}
      >
        {/* মূল স্ক্রিনসমূহ */}
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Channel" component={ChannelScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} />
        <Stack.Screen name="Playlist" component={PlaylistPage} />
        <Stack.Screen name="Shorts" component={ShortsScreen} />
        <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} />
        <Stack.Screen name="Live" component={LiveScreen} />

        {/* সেটিংস এবং অন্যান্য স্ক্রিনসমূহ */}
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="History" component={HistoryPage} />
        <Stack.Screen name="Downloads" component={DownloadScreen} />
        <Stack.Screen name="searchsettings" component={SearchSetting} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}