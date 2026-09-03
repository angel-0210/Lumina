import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { documentsApi, apiErrorMessage, ProcessingStatus } from '../services/api';

interface UploadModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function UploadModal({ visible, onClose, onSuccess }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<{
    uri: string | File;
    name: string;
    mimeType: string;
    size: number;
  } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handlePickFile = async () => {
    setError(null);
    try {
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.txt,.md,application/pdf,text/plain,text/markdown';
        input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (file) {
            if (file.size > 50 * 1024 * 1024) {
              setError('File size exceeds maximum 50MB limit.');
              return;
            }
            setSelectedFile({
              uri: file,
              name: file.name,
              mimeType: file.type || 'application/pdf',
              size: file.size,
            });
          }
        };
        input.click();
      } else {
        const res = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'text/plain', 'text/markdown'],
          copyToCacheDirectory: true,
        });

        if (!res.canceled && res.assets && res.assets.length > 0) {
          const asset = res.assets[0];
          if (asset.size && asset.size > 50 * 1024 * 1024) {
            setError('File size exceeds maximum 50MB limit.');
            return;
          }
          setSelectedFile({
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType || 'application/pdf',
            size: asset.size || 0,
          });
        }
      }
    } catch (err) {
      setError('Could not access document picker.');
    }
  };

  const startPollingStatus = (docId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const statusData = await documentsApi.status(docId);
        setProcessingStatus(statusData);

        if (statusData.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setUploading(false);
          if (onSuccess) onSuccess();
        } else if (statusData.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setUploading(false);
          setError(statusData.error_message || 'Processing failed. Please try again.');
        }
      } catch {
        // Suppress transient status polling errors
      }
    }, 2000);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    setProcessingStatus({ document_id: '', status: 'pending', progress_pct: 10, chunk_count: 0, error_message: null });

    try {
      const res = await documentsApi.upload(selectedFile.uri, selectedFile.name, selectedFile.mimeType);
      startPollingStatus(res.document.id);
    } catch (err) {
      setUploading(false);
      setError(apiErrorMessage(err, 'Failed to upload study material.'));
    }
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setSelectedFile(null);
    setUploading(false);
    setProcessingStatus(null);
    setError(null);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="cloud-upload-outline" size={22} color="#dfb7ff" />
              <Text style={styles.modalTitle}>Upload Study Material</Text>
            </View>
            <TouchableOpacity onPress={handleClose} disabled={uploading}>
              <Ionicons name="close-circle-outline" size={24} color="#6e748a" />
            </TouchableOpacity>
          </View>

          {/* Body content */}
          {processingStatus?.status === 'completed' ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={48} color="#408175" />
              <Text style={styles.successTitle}>Processing Complete!</Text>
              <Text style={styles.successSubtitle}>
                Generated {processingStatus.chunk_count} vector chunks and study units for "{selectedFile?.name}".
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
                <Text style={styles.doneBtnText}>Start Learning</Text>
              </TouchableOpacity>
            </View>
          ) : uploading ? (
            <View style={styles.processingBox}>
              <ActivityIndicator size="large" color="#dfb7ff" />
              <Text style={styles.processingTitle}>
                {processingStatus?.status === 'processing' ? 'Chunking & Indexing RAG Vectors...' : 'Uploading File...'}
              </Text>
              <Text style={styles.processingFile}>{selectedFile?.name}</Text>

              <View style={styles.progressBg}>
                <View style={[styles.progressFill, { width: `${processingStatus?.progress_pct || 15}%` }]} />
              </View>
              <Text style={styles.progressText}>{processingStatus?.progress_pct || 15}% Complete</Text>
            </View>
          ) : (
            <View style={styles.uploadForm}>
              <TouchableOpacity style={styles.dropzone} onPress={handlePickFile} activeOpacity={0.8}>
                <Ionicons name="document-text-outline" size={40} color="#dfb7ff" />
                <Text style={styles.dropzoneTitle}>
                  {selectedFile ? selectedFile.name : 'Choose a Document'}
                </Text>
                <Text style={styles.dropzoneSubtitle}>
                  {selectedFile
                    ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready`
                    : 'PDF, TXT, or Markdown up to 50MB'}
                </Text>
              </TouchableOpacity>

              {error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color="#ffb4ab" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <View style={styles.footerRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, !selectedFile && styles.submitBtnDisabled]}
                  disabled={!selectedFile}
                  onPress={handleUpload}
                >
                  <Text style={styles.submitBtnText}>Upload & Process</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    borderRadius: 20,
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(223, 183, 255, 0.3)',
    backgroundColor: 'rgba(153, 27, 247, 0.04)',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dropzoneTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
    textAlign: 'center',
  },
  dropzoneSubtitle: {
    fontSize: 12,
    color: '#6e748a',
    textAlign: 'center',
  },
  uploadForm: {
    gap: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 180, 171, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.2)',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 13,
    flex: 1,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#d1c1d7',
    fontSize: 14,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#991bf7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  processingBox: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  processingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  processingFile: {
    fontSize: 13,
    color: '#dfb7ff',
  },
  progressBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#131313',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#dfb7ff',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: '#6e748a',
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  successSubtitle: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
  },
  doneBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#408175',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
