import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: '#131313', // Brand base dark background
        },
      }}
    >
      <Stack.Screen name="signup" options={{ title: 'Sign Up', headerShown: false }} />
      <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
    </Stack>
  );
}
