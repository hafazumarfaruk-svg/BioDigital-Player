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
// নতুন যুক্ত করা Subscriptions স্ক্রিনটি ইমপোর্ট করা হলো
import SubscriptionsScreen from './screens/SubscriptionsScreen'; 

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
        
        {/* Subscriptions স্ক্রিনটি ঠিক এইখানে Navigator-এর ভেতরে থাকতে হবে */}
        <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ headerShown: false }} />
        
      </Stack.Navigator>
    </NavigationContainer>
  );
}