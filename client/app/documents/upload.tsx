import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import Button from '../../components/Button';
import { documentsApi, apiErrorMessage } from '../../services/api';

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function DocumentUploadScreen() {
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/markdown', 'text/x-markdown'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];

        // Validate file size (< 50MB)
        const sizeInMb = file.size ? file.size / (1024 * 1024) : 0;
        if (sizeInMb > 50) {
          Alert.alert('File Too Large', 'Please select a study material file under 50MB.');
          return;
        }

        setSelectedFile(file);
        setUploadState('idle');
        setProgress(0);
        setStatusMessage('');
      }
    } catch {
      Alert.alert('Error', 'Failed to read document.');
    }
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleUploadAndProcess = async () => {
    if (!selectedFile) return;

    setUploadState('uploading');
    setProgress(5);
    setStatusMessage('Uploading to storage…');

    try {
      const mimeType =
        selectedFile.mimeType ||
        (selectedFile.name?.endsWith('.pdf') ? 'application/pdf' :
          selectedFile.name?.endsWith('.md') || selectedFile.name?.endsWith('.markdown')
            ? 'text/markdown' : 'text/plain');

      const { document, job } = await documentsApi.upload(
        selectedFile.uri,
        selectedFile.name ?? 'document',
        mimeType,
      );

      setProgress(20);
      setUploadState('processing');
      setStatusMessage('Indexing and generating topics…');

      // Poll the status endpoint until processing completes.
      pollRef.current = setInterval(async () => {
        try {
          const status = await documentsApi.status(document.id);
          const pct = status.progress_pct;
          setProgress(20 + Math.round(pct * 0.8));   // scale 0-100 into 20-100

          if (status.status === 'completed') {
            stopPolling();
            setProgress(100);
            setUploadState('done');
            setStatusMessage(`${status.chunk_count} chunks indexed.`);

            Alert.alert(
              'Document Ready',
              `${selectedFile.name} was successfully indexed. ${status.chunk_count} content chunks created.`,
              [
                {
                  text: 'Proceed to Lessons',
                  onPress: () => {
                    setSelectedFile(null);
                    setUploadState('idle');
                    router.replace('/learn');
                  },
                },
              ]
            );
          } else if (status.status === 'failed') {
            stopPolling();
            setUploadState('error');
            setStatusMessage(status.error_message ?? 'Processing failed.');
            Alert.alert('Processing Failed', status.error_message ?? 'Document processing encountered an error.');
          }
        } catch {
          // Polling errors are transient; keep trying.
        }
      }, 3000);

    } catch (err) {
      stopPolling();
      setUploadState('error');
      setStatusMessage('Upload failed.');
      Alert.alert('Upload Failed', apiErrorMessage(err, 'Could not upload the document. Please try again.'));
    }
  };

  const handleClear = () => {
    stopPolling();
    setSelectedFile(null);
    setProgress(0);
    setUploadState('idle');
    setStatusMessage('');
  };

  const uploading = uploadState === 'uploading' || uploadState === 'processing';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Upload Document', headerShown: false }} />
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#b8bdd4" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upload Material</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Dropzone area */}
        <TouchableOpacity
          style={[
            styles.dropzone,
            selectedFile && styles.dropzoneActive,
            uploading && styles.dropzoneDisabled,
          ]}
          onPress={handlePickDocument}
          disabled={uploading}
          activeOpacity={0.8}
        >
          <View style={[
            styles.uploadIconContainer,
            selectedFile && styles.uploadIconContainerActive,
          ]}>
            <Ionicons
              name={selectedFile ? 'document-attach-outline' : 'cloud-upload-outline'}
              size={36}
              color={selectedFile ? '#dfb7ff' : '#6e748a'}
            />
          </View>
          <Text style={styles.dropzoneTitle}>
            {selectedFile ? selectedFile.name : 'Select Study Material'}
          </Text>
          <Text style={styles.dropzoneSubtitle}>
            {selectedFile
              ? `${(selectedFile.size ? selectedFile.size / (1024 * 1024) : 0).toFixed(2)} MB`
              : 'Tap to browse document vectors'
            }
          </Text>
          <Text style={styles.formatsNote}>Supported formats: PDF, TXT, MD (Max 50MB)</Text>
        </TouchableOpacity>

        {selectedFile && (
          <View style={styles.fileDetailsCard}>
            <View style={styles.fileRow}>
              <Ionicons name="document-text" size={24} color="#dfb7ff" />
              <View style={styles.fileTexts}>
                <Text style={styles.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                <Text style={styles.fileSize}>
                  {uploadState === 'idle' ? 'Ready to upload' : statusMessage}
                </Text>
              </View>
              {!uploading && (
                <TouchableOpacity onPress={handleClear} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={20} color="#ffb4ab" />
                </TouchableOpacity>
              )}
            </View>

            {(uploading || uploadState === 'done') && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>
                <View style={styles.progressTexts}>
                  <Text style={styles.progressLabel}>{statusMessage}</Text>
                  <Text style={styles.progressValue}>{progress}%</Text>
                </View>
              </View>
            )}

            {uploadState === 'error' && (
              <View style={styles.errorBadge}>
                <Ionicons name="warning-outline" size={14} color="#ffb4ab" />
                <Text style={styles.errorText}>{statusMessage || 'Upload failed. Try again.'}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.actionBlock}>
          <Button
            title={uploading ? 'Processing…' : 'Upload & Process'}
            onPress={handleUploadAndProcess}
            disabled={!selectedFile || uploading}
            loading={uploading}
            showArrow={!uploading}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(154, 140, 160, 0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f0f2f8',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContainer: {
    padding: 24,
    flexGrow: 1,
  },
  dropzone: {
    borderWidth: 2,
    borderColor: 'rgba(154, 140, 160, 0.15)',
    borderStyle: 'dashed',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  dropzoneActive: {
    borderColor: '#991bf7',
    backgroundColor: 'rgba(153, 27, 247, 0.02)',
    borderStyle: 'solid',
  },
  dropzoneDisabled: {
    opacity: 0.6,
  },
  uploadIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
  },
  uploadIconContainerActive: {
    backgroundColor: 'rgba(153, 27, 247, 0.1)',
    borderColor: 'rgba(153, 27, 247, 0.2)',
  },
  dropzoneTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f0f2f8',
    textAlign: 'center',
    marginBottom: 6,
  },
  dropzoneSubtitle: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    marginBottom: 16,
  },
  formatsNote: {
    fontSize: 10,
    color: '#6e748a',
    textAlign: 'center',
  },
  fileDetailsCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileTexts: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f2f8',
  },
  fileSize: {
    fontSize: 12,
    color: '#6e748a',
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 140, 160, 0.08)',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#1b1d26',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#991bf7',
    borderRadius: 3,
  },
  progressTexts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    color: '#a0a5c0',
  },
  progressValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dfb7ff',
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 100, 80, 0.1)',
  },
  errorText: {
    fontSize: 12,
    color: '#ffb4ab',
    flex: 1,
  },
  actionBlock: {
    marginTop: 'auto',
  },
});
