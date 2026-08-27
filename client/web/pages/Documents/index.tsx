import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { documentsApi, DocumentListItem, apiErrorMessage } from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebDocuments() {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Search and Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Upload States
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollingIntervals = useRef<{ [key: string]: ReturnType<typeof setInterval> }>({});

  const fetchDocuments = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);
      const res = await documentsApi.list(page, 10);
      setDocuments(res.items);
      setTotalPages(res.total_pages || 1);
      
      // Start polling for any document that is currently in 'processing' status
      res.items.forEach(doc => {
        if (doc.status === 'processing' || doc.status === 'pending') {
          startPollingDocumentStatus(doc.id);
        }
      });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not retrieve your documents.'));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments(true);
    return () => {
      // Clean up all polling intervals on unmount
      Object.values(pollingIntervals.current).forEach(clearInterval);
    };
  }, [page]);

  const startPollingDocumentStatus = (docId: string) => {
    if (pollingIntervals.current[docId]) return;

    pollingIntervals.current[docId] = setInterval(async () => {
      try {
        const status = await documentsApi.status(docId);
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(pollingIntervals.current[docId]);
          delete pollingIntervals.current[docId];
          fetchDocuments(false);
        }
      } catch (err) {
        // Suppress transient network errors during status checks
      }
    }, 3000);
  };

  // Upload Logic
  const handleUploadFile = async (file: File) => {
    const validMimeTypes = ['application/pdf', 'text/plain', 'text/markdown'];
    if (!validMimeTypes.includes(file.type) && !file.name.endsWith('.md')) {
      alert('Invalid file format. Please upload PDF, TXT, or Markdown documents.');
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(20);
      setUploadStatusMsg('Sending file to servers...');

      const uploadRes = await documentsApi.upload(file, file.name, file.type);
      
      setUploadProgress(70);
      setUploadStatusMsg('Generating conceptual nodes...');

      // Let it poll for processing status
      startPollingDocumentStatus(uploadRes.document.id);
      
      setUploadProgress(100);
      setUploadStatusMsg('Uploaded successfully! Digesting material...');
      
      setTimeout(() => {
        setUploading(false);
        fetchDocuments(false);
      }, 1500);

    } catch (err) {
      setUploading(false);
      alert(apiErrorMessage(err, 'We couldn\'t upload your document. Please try again.'));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (Platform.OS === 'web') {
      e.preventDefault();
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    if (Platform.OS === 'web') {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (Platform.OS === 'web') {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        await handleUploadFile(file);
      }
    }
  };

  const handleBrowseClick = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (Platform.OS === 'web' && e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await handleUploadFile(file);
    }
  };

  const handleDeleteDoc = async (docId: string, docTitle: string) => {
    const conf = confirm(`Are you sure you want to delete "${docTitle}"? This will permanently remove its topics, conceptual nodes, and study guides.`);
    if (!conf) return;

    try {
      if (pollingIntervals.current[docId]) {
        clearInterval(pollingIntervals.current[docId]);
        delete pollingIntervals.current[docId];
      }
      await documentsApi.delete(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      alert(apiErrorMessage(err, 'Unable to delete document. Please try again.'));
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <WebLayout>
      <View style={styles.container}>
        <View style={styles.leftPane}>
          <Text style={styles.title}>Document Library</Text>
          <Text style={styles.subtitle}>Manage your uploaded references. AI extracts nodes automatically.</Text>
          
          {/* Controls Bar */}
          <View style={styles.controlsRow}>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={18} color="#6e748a" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search local documents..."
                placeholderTextColor="#6e748a"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <TouchableOpacity style={styles.refreshButton} onPress={() => fetchDocuments(true)}>
              <Ionicons name="refresh" size={18} color="#d1c1d7" />
            </TouchableOpacity>
          </View>

          {/* List Table */}
          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#dfb7ff" />
              <Text style={styles.loadingText}>Fetching documents...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle" size={32} color="#ffb4ab" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : filteredDocuments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text" size={48} color="#353535" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'No matching documents found.' : 'No documents in library. Drag one to start.'}
              </Text>
            </View>
          ) : (
            <View style={styles.tableCard}>
              <View style={styles.table}>
                {/* Header */}
                <View style={[styles.row, styles.headerRow]}>
                  <Text style={[styles.col, styles.colTitle, styles.headerText]}>Document</Text>
                  <Text style={[styles.col, styles.colSize, styles.headerText]}>Size</Text>
                  <Text style={[styles.col, styles.colTopics, styles.headerText]}>Topics</Text>
                  <Text style={[styles.col, styles.colStatus, styles.headerText]}>Status</Text>
                  <Text style={[styles.col, styles.colActions, styles.headerText]}></Text>
                </View>
                
                {/* Items */}
                {filteredDocuments.map(doc => (
                  <View key={doc.id} style={styles.row}>
                    <TouchableOpacity 
                      style={[styles.col, styles.colTitle, styles.colClickable]}
                      onPress={() => router.push(`/documents/${doc.id}`)}
                    >
                      <Ionicons name="document-text-outline" size={16} color="#dfb7ff" style={styles.docIcon} />
                      <View style={styles.titleInfo}>
                        <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
                        <Text style={styles.docDate}>{doc.date}</Text>
                      </View>
                    </TouchableOpacity>

                    <Text style={[styles.col, styles.colSize, styles.bodyText]}>{doc.size}</Text>
                    
                    <Text style={[styles.col, styles.colTopics, styles.bodyText]}>
                      {doc.topics} {doc.topics === 1 ? 'topic' : 'topics'}
                    </Text>

                    <View style={[styles.col, styles.colStatus]}>
                      <View style={[
                        styles.statusBadge,
                        doc.status === 'completed' && styles.badgeCompleted,
                        doc.status === 'processing' && styles.badgeProcessing,
                        doc.status === 'failed' && styles.badgeFailed,
                      ]}>
                        <Text style={[
                          styles.statusText,
                          doc.status === 'completed' && styles.statusCompleted,
                          doc.status === 'processing' && styles.statusProcessing,
                          doc.status === 'failed' && styles.statusFailed,
                        ]}>
                          {doc.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.col, styles.colActions]}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => router.push(`/documents/${doc.id}`)}
                      >
                        <Ionicons name="eye-outline" size={16} color="#d1c1d7" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleDeleteDoc(doc.id, doc.title)}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ffb4ab" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>

              {/* Pagination footer */}
              {totalPages > 1 && (
                <View style={styles.pagination}>
                  <TouchableOpacity
                    style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                    disabled={page === 1}
                    onPress={() => setPage(p => Math.max(1, p - 1))}
                  >
                    <Ionicons name="chevron-back" size={18} color={page === 1 ? '#353535' : '#e2e2e2'} />
                  </TouchableOpacity>
                  <Text style={styles.pageIndicator}>Page {page} of {totalPages}</Text>
                  <TouchableOpacity
                    style={[styles.pageBtn, page === totalPages && styles.pageBtnDisabled]}
                    disabled={page === totalPages}
                    onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                  >
                    <Ionicons name="chevron-forward" size={18} color={page === totalPages ? '#353535' : '#e2e2e2'} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Right Pane: Upload Drawer */}
        <View style={styles.rightPane}>
          <Text style={styles.drawerTitle}>Ingestion Center</Text>
          <Text style={styles.drawerSubtitle}>Add textbook chapters, notes or syllabus vectors.</Text>

          {/* Web Dropzone */}
          {Platform.OS === 'web' && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                ...webStyles.dropzone,
                borderColor: isDragging ? '#dfb7ff' : 'rgba(245, 248, 255, 0.1)',
                backgroundColor: isDragging ? 'rgba(223, 183, 255, 0.04)' : '#1f1f1f',
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.txt,.md"
                style={{ display: 'none' }}
              />

              <Ionicons name="cloud-upload" size={48} color={isDragging ? '#dfb7ff' : '#6e748a'} style={styles.uploadIcon} />
              <Text style={styles.uploadLabel}>Drag and drop document here</Text>
              <Text style={styles.uploadOr}>— OR —</Text>
              <TouchableOpacity style={styles.browseButton} onPress={handleBrowseClick}>
                <Text style={styles.browseButtonText}>Browse Files</Text>
              </TouchableOpacity>
              <Text style={styles.uploadMeta}>Supports PDF, TXT, MD up to 50MB</Text>
            </div>
          )}

          {/* Upload Progress Overlay */}
          {uploading && (
            <View style={styles.uploadProgressBox}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>{uploadStatusMsg}</Text>
                <Text style={styles.progressPct}>{uploadProgress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
              </View>
            </View>
          )}
        </View>
      </View>
    </WebLayout>
  );
}

const webStyles = {
  dropzone: {
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderRadius: '16px',
    padding: '40px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    outline: 'none',
    minHeight: '280px',
  } as React.CSSProperties,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    gap: 32,
  },
  leftPane: {
    flex: 2,
  },
  rightPane: {
    flex: 1,
    minWidth: 320,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
    height: 'fit-content' as any,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e2e2e2',
    letterSpacing: -0.6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6e748a',
    marginTop: 6,
    marginBottom: 24,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.06)',
    borderRadius: 8,
    paddingHorizontal: 16,
    gap: 10,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: '#e2e2e2',
    fontSize: 13,
    outlineWidth: 0 as any,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContainer: {
    paddingVertical: 100,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#6e748a',
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: 'rgba(255, 180, 171, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.15)',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 80,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    color: '#6e748a',
    fontSize: 14,
  },
  tableCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  table: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 248, 255, 0.05)',
  },
  headerRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderBottomWidth: 1.5,
  },
  col: {
    flex: 1,
  },
  colTitle: {
    flex: 2.5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colClickable: {
    cursor: 'pointer' as any,
  },
  colSize: {
    flex: 1,
    textAlign: 'left',
  },
  colTopics: {
    flex: 1,
    textAlign: 'left',
  },
  colStatus: {
    flex: 1,
    alignItems: 'flex-start',
  },
  colActions: {
    flex: 1.2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#d1c1d7',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  docIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  titleInfo: {
    flex: 1,
  },
  docTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  docDate: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 3,
  },
  bodyText: {
    fontSize: 13,
    color: '#e2e2e2',
  },
  statusBadge: {
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
  },
  badgeCompleted: {
    backgroundColor: 'rgba(64, 129, 117, 0.1)',
    borderColor: 'rgba(64, 129, 117, 0.25)',
  },
  badgeProcessing: {
    backgroundColor: 'rgba(214, 200, 115, 0.1)',
    borderColor: 'rgba(214, 200, 115, 0.25)',
  },
  badgeFailed: {
    backgroundColor: 'rgba(255, 180, 171, 0.1)',
    borderColor: 'rgba(255, 180, 171, 0.25)',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6e748a',
  },
  statusCompleted: {
    color: '#408175',
  },
  statusProcessing: {
    color: '#d6c873',
  },
  statusFailed: {
    color: '#ffb4ab',
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 16,
  },
  pageBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1b1b1b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: {
    opacity: 0.3,
  },
  pageIndicator: {
    color: '#6e748a',
    fontSize: 13,
    fontWeight: '500',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 6,
  },
  drawerSubtitle: {
    fontSize: 13,
    color: '#6e748a',
    marginBottom: 24,
    lineHeight: 18,
  },
  uploadIcon: {
    marginBottom: 16,
  },
  uploadLabel: {
    color: '#e2e2e2',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  uploadOr: {
    color: '#6e748a',
    fontSize: 11,
    fontWeight: '700',
    marginVertical: 12,
  },
  browseButton: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  browseButtonText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '700',
  },
  uploadMeta: {
    color: '#6e748a',
    fontSize: 11,
  },
  uploadProgressBox: {
    marginTop: 20,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 12,
    color: '#d1c1d7',
    fontWeight: '500',
  },
  progressPct: {
    fontSize: 12,
    fontWeight: '700',
    color: '#dfb7ff',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(245, 248, 255, 0.04)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#dfb7ff',
    borderRadius: 2,
  },
});
