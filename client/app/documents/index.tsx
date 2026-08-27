import React from 'react';
import { Platform } from 'react-native';
import WebDocuments from '../../web/pages/Documents';

export default function DocumentsScreen() {
  if (Platform.OS === 'web') {
    return <WebDocuments />;
  }
  return null; // Web-only route
}
