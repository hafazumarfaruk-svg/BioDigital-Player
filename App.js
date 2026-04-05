import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// আপনার তৈরি করা সব স্ক্রিন ইমপোর্ট করা হলো
import HomeScreen from './screens/HomeScreen';
import PlayerScreen from './screens/PlayerScreen';
import ChannelScreen from './screens/ChannelScreen';
import PlaylistScreen from './screens/PlaylistPage';
import ShortsScreen from './screens/ShortsScreen';
import HistoryPage from './Settings/HistoryPage'; 
import SubscriptionsScreen from './screens/SubscriptionsScreen'; 
// নতুন যুক্ত করা Search স্ক্রিনটি ইমপোর্ট করা হলো
import SearchSettingScreen from './Settings/searchsetting'; 

// গ্লোবাল ভিডিও প্লেয়ার (Zero-Loading System) ইমপোর্ট করা হলো
import GlobalVideoPlayer from './Settings/GlobalVideoPlayer'; // ফাইলটির সঠিক লোকেশন/পাথ অনুযায়ী ফোল্ডার মিলিয়ে নেবেন

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

        {/* Search স্ক্রিনটি ঠিক এইখানে Navigator-এর ভেতরে যুক্ত করা হলো */}
        <Stack.Screen name="Search" component={SearchSettingScreen} options={{ headerShown: false }} />

      </Stack.Navigator>

      {/* সব স্ক্রিনের উপরে ভাসমান গ্লোবাল প্লেয়ার এখানে যুক্ত করা হলো */}
      <GlobalVideoPlayer />
      
    </NavigationContainer>
  );
}