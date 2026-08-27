import React from 'react';
import { Platform } from 'react-native';
import WebSettings from '../web/pages/Settings';

export default function SettingsScreen() {
  if (Platform.OS === 'web') {
    return <WebSettings />;
  }
  return null; // Web-only
}
