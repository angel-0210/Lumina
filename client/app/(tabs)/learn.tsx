import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';
import { learningApi, documentsApi, Topic, DocumentListItem, apiErrorMessage } from '../../services/api';

const FILTERS = ['All', 'In Progress', 'Completed', 'Not Started'];

interface DocumentGroup {
  documentId: string;
  documentTitle: string;
  status: string;
  progress: number;
  topics: Topic[];
}

function buildDocumentGroups(documents: DocumentListItem[], topics: Topic[]): DocumentGroup[] {
  const groupsMap = new Map<string, DocumentGroup>();
  for (const doc of documents) {
    groupsMap.set(doc.id, {
      documentId: doc.id,
      documentTitle: doc.title,
      status: doc.status,
      progress: doc.progress,
      topics: [],
    });
  }
  for (const topic of topics) {
    const group = groupsMap.get(topic.documentId);
    if (group) {
      group.topics.push(topic);
    } else {
      groupsMap.set(topic.documentId, {
        documentId: topic.documentId,
        documentTitle: topic.documentTitle || topic.subject || 'Unknown document',
        status: 'completed',
        progress: 1.0,
        topics: [topic],
      });
    }
  }
  return Array.from(groupsMap.values());
}

function filterTopic(topic: Topic, filter: string): boolean {
  if (filter === 'All') return true;
  if (filter === 'In Progress') return topic.mastery > 0 && topic.mastery < 1;
  if (filter === 'Completed') return topic.mastery >= 1;
  if (filter === 'Not Started') return topic.mastery === 0;
  return true;
}

import WebLearning from '../../web/pages/Learning';

export default function LearnHub() {
  const accessToken = useAppStore((state) => state.accessToken);
  const sessionRestored = useAppStore((state) => state.sessionRestored);

  if (sessionRestored && !accessToken) {
    return <Redirect href="/signup" />;
  }

  if (!sessionRestored) {
    return (
      <View style={{ flex: 1, backgroundColor: '#131313', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#dfb7ff" />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return <WebLearning />;
  }

  return <MobileLearnHub />;
}

function MobileLearnHub() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingDocId, setGeneratingDocId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [topicsRes, docsRes] = await Promise.all([
        learningApi.listTopics(1, 100),
        documentsApi.list(1, 100),
      ]);
      setTopics(topicsRes.items);
      setDocuments(docsRes.items);
    } catch {
      // Non-fatal; show empty state.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling for processing documents or generating topics
  useEffect(() => {
    const isProcessing = 
      documents.some(d => d.status === 'pending' || d.status === 'processing') ||
      topics.some(t => t.status === 'active' && t.totalScenes === 0);

    if (isProcessing) {
      const interval = setInterval(() => {
        fetchData();
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [documents, topics, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleGenerateLesson = async (docId: string) => {
    setGeneratingDocId(docId);
    try {
      await learningApi.generateLesson(docId);
      Alert.alert(
        'Lesson Generation Initiated',
        'Lumina AI is generating study units and tutorial scenes for this document. You can monitor progress directly here.',
      );
      fetchData();
    } catch (err) {
      Alert.alert('Generation Failed', apiErrorMessage(err, 'Failed to generate study units.'));
    } finally {
      setGeneratingDocId(null);
    }
  };

  const allGroups = buildDocumentGroups(documents, topics);

  const filteredGroups = allGroups.filter((g) => {
    const docMatches = g.documentTitle.toLowerCase().includes(searchQuery.toLowerCase());
    
    g.topics = g.topics.filter((t) => {
      const topicMatches = t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const filterMatches = filterTopic(t, selectedFilter);
      return topicMatches && filterMatches;
    });

    const isWorkingState = g.status === 'processing' || g.status === 'pending' || g.status === 'failed';
    if (isWorkingState) {
      return searchQuery === '' || docMatches;
    }

    return docMatches || g.topics.length > 0;
  });

  // In-progress lessons (totalScenes > 0 and mastery > 0 and < 1)
  const continuingTopics = topics.filter(
    (t) => t.mastery > 0 && t.mastery < 1 && t.totalScenes > 0
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Learn</Text>
        <Text style={styles.screenSubtitle}>Progress through your structured topics</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#6e748a" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search topics or lessons..."
          placeholderTextColor="rgba(209, 193, 215, 0.4)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={18} color="#6e748a" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#991bf7" colors={['#991bf7']} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#991bf7" />
            <Text style={styles.loadingText}>Loading topics…</Text>
          </View>
        ) : documents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={48} color="#353b50" />
            <Text style={styles.emptyText}>No topics yet.</Text>
            <Text style={styles.emptySubtext}>Upload a document and generate a lesson to get started.</Text>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => router.push('/documents/upload')}
              activeOpacity={0.8}
            >
              <Text style={styles.uploadButtonText}>Upload Document</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Continue Learning Section */}
            {continuingTopics.length > 0 && searchQuery === '' && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Continue Learning</Text>
                {continuingTopics.slice(0, 2).map((topic) => (
                  <TouchableOpacity
                    key={topic.id}
                    style={styles.continueCard}
                    onPress={() => router.push(`/lesson/${topic.id}`)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.continueHeader}>
                      <View style={styles.continueIconWrapper}>
                        <Ionicons name="play" size={20} color="#dfb7ff" />
                      </View>
                      <View style={styles.continueTexts}>
                        <Text style={styles.continueTitle}>{topic.name}</Text>
                        <Text style={styles.continueSubtitle}>
                          {topic.documentTitle} • {topic.totalScenes} scenes
                        </Text>
                      </View>
                    </View>
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${topic.mastery * 100}%` }]} />
                      </View>
                      <Text style={styles.progressPercent}>{Math.round(topic.mastery * 100)}% Complete</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Filter Chips */}
            <View style={styles.filterWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {FILTERS.map((filter) => (
                  <TouchableOpacity
                    key={filter}
                    style={[styles.filterChip, selectedFilter === filter && styles.filterChipActive]}
                    onPress={() => setSelectedFilter(filter)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterChipText, selectedFilter === filter && styles.filterChipTextActive]}>
                      {filter}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Topic Groups List */}
            <View style={styles.topicGroupsSection}>
              {filteredGroups.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color="#6e748a" />
                  <Text style={styles.emptyText}>No topics matching filters found.</Text>
                </View>
              ) : (
                filteredGroups.map((group) => {
                  const isProcessing = group.status === 'pending' || group.status === 'processing';
                  const isFailed = group.status === 'failed';
                  
                  return (
                    <View key={group.documentId} style={styles.groupContainer}>
                      <View style={styles.groupHeader}>
                        <Ionicons name="document-text-outline" size={16} color="#6e748a" />
                        <Text style={styles.groupTitle}>{group.documentTitle}</Text>
                      </View>

                      <View style={styles.topicsList}>
                        {isProcessing && (
                          <View style={styles.statusCard}>
                            <View style={styles.statusRow}>
                              <ActivityIndicator size="small" color="#dfb7ff" />
                              <Text style={styles.statusText}>Processing document… Just a moment.</Text>
                            </View>
                            <View style={styles.statusProgressBg}>
                              <View style={[styles.statusProgressFill, { width: `${group.progress * 100}%` }]} />
                            </View>
                          </View>
                        )}

                        {isFailed && (
                          <View style={[styles.statusCard, styles.failedCard]}>
                            <View style={styles.statusRow}>
                              <Ionicons name="alert-circle-outline" size={18} color="#ffb4ab" />
                              <Text style={[styles.statusText, styles.failedText]}>Processing failed. Please delete and re-upload.</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.retryButton}
                              onPress={async () => {
                                try {
                                  await documentsApi.delete(group.documentId);
                                  fetchData();
                                } catch (err) {
                                  Alert.alert('Error', 'Failed to remove document.');
                                }
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.retryButtonText}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {group.status === 'completed' && group.topics.length === 0 && (
                          <View style={styles.statusCard}>
                            <Text style={styles.readyText}>Document indexed. Ready to generate learning topics.</Text>
                            <TouchableOpacity
                              style={styles.generateButton}
                              onPress={() => handleGenerateLesson(group.documentId)}
                              disabled={generatingDocId !== null}
                              activeOpacity={0.8}
                            >
                              {generatingDocId === group.documentId ? (
                                <ActivityIndicator size="small" color="#ffffff" />
                              ) : (
                                <>
                                  <Ionicons name="color-wand-outline" size={16} color="#ffffff" />
                                  <Text style={styles.generateButtonText}>Generate Study Topics</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        )}

                        {group.topics.map((topic) => (
                          <TouchableOpacity
                            key={topic.id}
                            style={styles.topicCard}
                            onPress={() => router.push(`/mastery/${topic.id}`)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.topicMain}>
                              <View style={styles.topicTexts}>
                                <Text style={styles.topicName}>{topic.name}</Text>
                                <Text style={styles.topicLessons}>
                                  {topic.totalScenes > 0
                                    ? `${topic.totalScenes} Scenes`
                                    : topic.status === 'active' ? 'Generating…' : 'Not started'}
                                </Text>
                              </View>
                              <View style={styles.topicMasteryContainer}>
                                <View style={styles.masteryIndicator}>
                                  <Text style={styles.masteryPercent}>{Math.round(topic.mastery * 100)}%</Text>
                                  <Text style={styles.masteryLabel}>Mastery</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color="#6e748a" />
                              </View>
                            </View>
                            <View style={styles.topicProgressBg}>
                              <View style={[styles.topicProgressFill, { width: `${topic.mastery * 100}%` }]} />
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d1117' },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 10 : 10,
    marginBottom: 16,
  },
  screenTitle: { fontSize: 28, fontWeight: '700', color: '#f0f2f8' },
  screenSubtitle: { fontSize: 14, color: '#6e748a', marginTop: 4 },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.4)', borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)', borderRadius: 12,
    marginHorizontal: 20, paddingHorizontal: 12, height: 44, marginBottom: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#f0f2f8', fontSize: 14, height: '100%' },
  scrollContainer: { paddingHorizontal: 20, paddingBottom: 100 },
  loadingContainer: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 14, color: '#6e748a' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 15, color: '#a0a5c0', fontWeight: '600', textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: '#6e748a', textAlign: 'center', lineHeight: 18 },
  uploadButton: {
    marginTop: 8, backgroundColor: 'rgba(153, 27, 247, 0.12)',
    borderWidth: 1, borderColor: 'rgba(153, 27, 247, 0.3)',
    borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10,
  },
  uploadButtonText: { fontSize: 14, color: '#dfb7ff', fontWeight: '600' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#f0f2f8', marginBottom: 12, letterSpacing: 0.5 },
  continueCard: {
    backgroundColor: 'rgba(153, 27, 247, 0.04)', borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.15)', borderRadius: 16, padding: 16,
  },
  continueHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  continueIconWrapper: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(153, 27, 247, 0.12)', justifyContent: 'center', alignItems: 'center',
  },
  continueTexts: { flex: 1 },
  continueTitle: { fontSize: 15, fontWeight: '600', color: '#dfb7ff' },
  continueSubtitle: { fontSize: 11, color: '#6e748a', marginTop: 2 },
  progressContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  progressBarBg: { flex: 1, height: 5, backgroundColor: '#1b1d26', borderRadius: 2.5, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#991bf7', borderRadius: 2.5 },
  progressPercent: { fontSize: 11, color: '#a0a5c0', fontWeight: '500' },
  filterWrapper: { marginBottom: 20, marginHorizontal: -20 },
  filterScroll: { paddingHorizontal: 20, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.02)', borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
  },
  filterChipActive: { backgroundColor: 'rgba(153, 27, 247, 0.1)', borderColor: 'rgba(153, 27, 247, 0.3)' },
  filterChipText: { color: '#6e748a', fontSize: 13, fontWeight: '500' },
  filterChipTextActive: { color: '#dfb7ff' },
  topicGroupsSection: { gap: 20 },
  groupContainer: { gap: 10 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  groupTitle: { fontSize: 13, fontWeight: '500', color: '#6e748a' },
  topicsList: { gap: 12 },
  topicCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)', borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)', borderRadius: 16, overflow: 'hidden',
  },
  topicMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  topicTexts: { flex: 1, marginRight: 12 },
  topicName: { fontSize: 15, fontWeight: '600', color: '#f0f2f8' },
  topicLessons: { fontSize: 12, color: '#6e748a', marginTop: 4 },
  topicMasteryContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  masteryIndicator: { alignItems: 'flex-end' },
  masteryPercent: { fontSize: 14, fontWeight: '600', color: '#dfb7ff' },
  masteryLabel: { fontSize: 9, color: '#6e748a', marginTop: 1 },
  topicProgressBg: { height: 3, backgroundColor: '#1b1d26', width: '100%' },
  topicProgressFill: { height: '100%', backgroundColor: '#991bf7' },
  statusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: '#b8bdd4',
    fontSize: 13,
  },
  statusProgressBg: {
    height: 4,
    backgroundColor: '#1b1d26',
    borderRadius: 2,
    overflow: 'hidden',
  },
  statusProgressFill: {
    height: '100%',
    backgroundColor: '#dfb7ff',
  },
  failedCard: {
    borderColor: 'rgba(255, 100, 80, 0.15)',
    backgroundColor: 'rgba(255, 100, 80, 0.02)',
  },
  failedText: {
    color: '#ffb4ab',
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 180, 171, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryButtonText: {
    color: '#ffb4ab',
    fontSize: 12,
    fontWeight: '600',
  },
  readyText: {
    color: '#a0a5c0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#991bf7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
});
