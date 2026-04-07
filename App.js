import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// [FIX]: স্ক্রিনের নচ (Notch) থেকে প্লেয়ারকে সুরক্ষিত রাখার জন্য SafeAreaProvider ইমপোর্ট করা হলো
import { SafeAreaProvider } from 'react-native-safe-area-context';

// আপনার তৈরি করা সব স্ক্রিন ইমপোর্ট করা হলো
import HomeScreen from './Screens/HomeScreen';
import PlayerScreen from './Screens/PlayerScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlaylistScreen from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import HistoryPage from './Settings/HistoryPage'; 
import SubscriptionsScreen from './screens/SubscriptionsScreen'; 
import SearchSettingScreen from './Settings/searchsetting'; 

// [FIX]: নতুন যুক্ত করা ডাউনলোড স্ক্রিন এবং গ্লোবাল প্লেয়ার ইমপোর্ট করা হলো
// (বি.দ্র: আপনার ফোল্ডার স্ট্রাকচার অনুযায়ী DownloadScreen এবং GlobalPlayer এর পাথ './screens/' দেওয়া হলো। যদি পাথ ভিন্ন হয়, তবে তা মিলিয়ে নেবেন)
import downloadscreen from './Settings/downloadscreen';
import GlobalPlayer from './Settings/GlobalPlayer'; 

const Stack = createStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
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
          
          {/* ডাউনলোড স্ক্রিনটি এখানে যুক্ত করা হলো */}
          <Stack.Screen name="Downloads" component={downloadscreen} options={{ headerShown: false }} />
          
        </Stack.Navigator>
        
        {/* গ্লোবাল প্লেয়ারটি স্ট্যাকের বাইরে রাখা হলো যাতে এটি সব স্ক্রিনের উপরে ভাসতে পারে */}
        <GlobalPlayer />
        
      </NavigationContainer>
    </SafeAreaProvider>
  );
}