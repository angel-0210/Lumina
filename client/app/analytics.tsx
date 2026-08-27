import React from 'react';
import { Platform } from 'react-native';
import WebAnalytics from '../web/pages/Analytics';

export default function AnalyticsScreen() {
  if (Platform.OS === 'web') {
    return <WebAnalytics />;
  }
  return null; // Web-only
}
