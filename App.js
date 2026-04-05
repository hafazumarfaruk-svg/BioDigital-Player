import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// আপনার তৈরি করা সব স্ক্রিন ইমপোর্ট করা হলো
import HomeScreen from './Screens/HomeScreen';
import PlayerScreen from './Screens/PlayerScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlaylistScreen from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import HistoryPage from './Settings/HistoryPage'; 
import SubscriptionsScreen from './Screens/SubscriptionsScreen'; 
import SearchSettingScreen from './Settings/searchsetting'; 

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

        {/* Search স্ক্রিনটি সঠিকভাবে যুক্ত করা হয়েছে */}
        <Stack.Screen name="Search" component={SearchSettingScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}