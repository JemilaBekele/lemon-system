import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { TamaguiProvider } from 'tamagui';
import { config } from '@/tamagui.config';
import { Palette } from '@/constants/palette';
import { Provider } from 'react-redux';
import store from '@/(redux)/store';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import queryClient from "../(services)/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaView } from 'react-native-safe-area-context';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <TamaguiProvider config={config} defaultTheme="light">
          <SafeAreaView style={{ flex: 1, backgroundColor: Palette.background }} edges={['top']}>
            <Stack screenOptions={{ contentStyle: { backgroundColor: Palette.background } }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
  
            </Stack>
          </SafeAreaView>
          <StatusBar style="dark" backgroundColor={Palette.background} />
        </TamaguiProvider>
      </QueryClientProvider>
    </Provider>
  );
}