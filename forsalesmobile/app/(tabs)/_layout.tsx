import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Palette } from '@/constants/palette';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Palette.primary,
        tabBarInactiveTintColor: Palette.textMuted,
        tabBarLabelStyle: { fontWeight: '600' },
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: Palette.surface,
          borderTopColor: Palette.border,
        },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name={focused ? "house.fill" : "house"} 
              color={color} 
            />
          ),
        }}
      />
    
      <Tabs.Screen
        name="Order"
        options={{
          title: 'Order',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name={focused ? "list.bullet" : "list.bullet"} 
              color={color} 
            />
          ),
        }}
      />
      
      <Tabs.Screen
        name="Cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name={focused ? "cart.fill" : "cart"} 
              color={color} 
            />
          ),
        }}
      />
        
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name={focused ? "person.circle.fill" : "person.circle"} 
              color={color} 
            />
          ),
        }}
      />
    </Tabs>
  );
}