import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import HomeScreen from './screens/HomeScreen';
import PlayerScreen from './screens/PlayerScreen';
import ChannelScreen from './screens/ChannelScreen';
import PlaylistScreen from './screens/PlaylistPage';
import ShortsScreen from './screens/ShortsScreen';
import HistoryPage from './Settings/HistoryPage'; 
import SubscriptionsScreen from './screens/SubscriptionsScreen'; 
import SearchSettingScreen from './Settings/searchsetting'; 

// নতুন গ্লোবাল প্লেয়ার ইমপোর্ট করা হলো
import GlobalPlayer from './GlobalPlayer'; 

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Player" component={PlayerScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Channel" component={ChannelScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Playlist" component={PlaylistScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Shorts" component={ShortsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="History" component={HistoryPage} options={{ headerShown: false }} />
        <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Search" component={SearchSettingScreen} options={{ headerShown: false }} />
      </Stack.Navigator>

      {/* এই প্লেয়ারটি সব স্ক্রিনের উপরে ভাসবে এবং কখনো আনমাউন্ট হবে না */}
      <GlobalPlayer />

    </NavigationContainer>
  );
}