import React from 'react';
import { Platform } from 'react-native';
import WebCrucible from '../../web/pages/Crucible';

export default function CrucibleScreen() {
  if (Platform.OS === 'web') {
    return <WebCrucible />;
  }
  return null; // Web-only route
}
