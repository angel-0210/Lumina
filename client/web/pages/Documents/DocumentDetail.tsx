import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  documentsApi,
  learningApi,
  DocumentDetail,
  Topic,
  LessonListItem,
  apiErrorMessage
} from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebDocumentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [generatingLesson, setGeneratingLesson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDetail = async (showLoading = true) => {
    if (!id) return;
    try {
      if (showLoading) setLoading(true);
      setError(null);
      
      const [docData, topicsData, lessonsData] = await Promise.all([
        documentsApi.get(id),
        learningApi.listTopics(1, 50, id),
        learningApi.listLessons(1, 10, id),
      ]);
      
      setDoc(docData);
      setTopics(topicsData.items);
      setLessons(lessonsData.items);

      if (docData.status === 'processing' || docData.status === 'pending') {
        startPolling();
      } else {
        stopPolling();
      }

    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load document details.'));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const startPolling = () => {
    if (pollInterval.current) return;
    pollInterval.current = setInterval(async () => {
      if (!id) return;
      try {
        const status = await documentsApi.status(id);
        if (status.status === 'completed' || status.status === 'failed') {
          stopPolling();
          fetchDetail(false);
        }
      } catch {
        // Ignore status polling errors
      }
    }, 4000);
  };

  const stopPolling = () => {
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }
  };

  useEffect(() => {
    fetchDetail(true);
    return () => stopPolling();
  }, [id]);

  const handleGenerateLesson = async () => {
    if (!id) return;
    try {
      setGeneratingLesson(true);
      const res = await learningApi.generateLesson(id);
      alert('AI Generation started! It may take 10-15 seconds to generate slides.');
      
      // Navigate to the lesson player - it handles its own polling if scenes are not yet populated!
      router.push(`/lesson/${res.lessonId}`);
    } catch (err) {
      alert(apiErrorMessage(err, 'We couldn\'t start lesson generation. Please try again.'));
    } finally {
      setGeneratingLesson(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !doc) return;
    const conf = confirm(`Are you sure you want to delete "${doc.title}"?`);
    if (!conf) return;

    try {
      stopPolling();
      await documentsApi.delete(id);
      router.replace('/documents');
    } catch (err) {
      alert(apiErrorMessage(err, 'Unable to delete document.'));
    }
  };

  return (
    <WebLayout>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Breadcrumb Back */}
        <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/documents')}>
          <Ionicons name="arrow-back" size={16} color="#d6c873" />
          <Text style={styles.backLinkText}>Back to Library</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#dfb7ff" />
            <Text style={styles.loadingText}>Fetching document details...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={32} color="#ffb4ab" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !doc ? null : (
          <View style={styles.layout}>
            {/* Left Column: Details & Extracted topics */}
            <View style={styles.leftCol}>
              <View style={styles.titleRow}>
                <Ionicons name="document-text" size={32} color="#dfb7ff" />
                <View>
                  <Text style={styles.title}>{doc.title}</Text>
                  <Text style={styles.metaSub}>Uploaded on {doc.date} • {doc.size}</Text>
                </View>
              </View>

              {/* Processing Warning banner */}
              {(doc.status === 'processing' || doc.status === 'pending') && (
                <View style={styles.processingBanner}>
                  <ActivityIndicator size="small" color="#d6c873" />
                  <View style={styles.bannerTexts}>
                    <Text style={styles.bannerTitle}>Document Vector Ingestion In Progress</Text>
                    <Text style={styles.bannerDesc}>
                      Lumina AI is currently splitting the document into semantic chunks and generating embeddings.
                    </Text>
                  </View>
                </View>
              )}

              {/* Topics section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Extracted Topics</Text>
                {topics.length > 0 ? (
                  <View style={webStyles.topicsGrid as any}>
                    {topics.map((topic, index) => (
                      <View key={topic.id} style={styles.topicCard}>
                        <View style={styles.topicHeader}>
                          <Text style={styles.topicIndex}>TOPIC {index + 1}</Text>
                          <View style={styles.topicMasteryBadge}>
                            <Text style={styles.topicMasteryText}>{Math.round(topic.mastery * 100)}% Mastered</Text>
                          </View>
                        </View>
                        <Text style={styles.topicTitle}>{topic.name}</Text>
                        <Text style={styles.topicDesc} numberOfLines={3}>{topic.desc}</Text>
                        
                        <View style={styles.topicFooter}>
                          <TouchableOpacity
                            style={styles.topicActionBtn}
                            onPress={() => router.push(`/mastery/${topic.id}`)}
                          >
                            <Ionicons name="git-network-outline" size={14} color="#dfb7ff" />
                            <Text style={styles.topicActionText}>Explore Nodes</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.topicActionBtn, styles.crucibleBtn]}
                            onPress={() => router.push(`/crucible`)}
                          >
                            <Ionicons name="flame-outline" size={14} color="#FFBF00" />
                            <Text style={[styles.topicActionText, styles.crucibleText]}>Test Crucible</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyCard}>
                    <Ionicons name="construct-outline" size={24} color="#353535" />
                    <Text style={styles.emptyText}>
                      {doc.status === 'completed'
                        ? 'No topics could be extracted from this document.'
                        : 'Topics will appear once vector ingestion completes.'}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Right Column: Actions and Lessons list */}
            <View style={styles.rightCol}>
              {/* Document actions box */}
              <View style={styles.actionsBox}>
                <Text style={styles.boxTitle}>Ingested Details</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Status</Text>
                  <Text style={[
                    styles.infoVal,
                    doc.status === 'completed' && styles.statusCompleted,
                    doc.status === 'processing' && styles.statusProcessing,
                    doc.status === 'failed' && styles.statusFailed,
                  ]}>
                    {doc.status.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Type</Text>
                  <Text style={styles.infoVal}>{doc.file_type?.toUpperCase() || 'UNKNOWN'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Chunks Embedded</Text>
                  <Text style={styles.infoVal}>{doc.chunk_count}</Text>
                </View>

                <View style={styles.boxDivider} />

                {/* Generate Lesson button */}
                <TouchableOpacity
                  style={[
                    styles.primaryActionBtn,
                    (doc.status !== 'completed' || generatingLesson) && styles.actionBtnDisabled
                  ]}
                  disabled={doc.status !== 'completed' || generatingLesson}
                  onPress={handleGenerateLesson}
                >
                  {generatingLesson ? (
                    <ActivityIndicator size="small" color="#131313" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={16} color="#131313" />
                      <Text style={styles.primaryActionText}>Generate Study Lesson</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteActionBtn}
                  onPress={handleDelete}
                >
                  <Ionicons name="trash-outline" size={16} color="#ffb4ab" />
                  <Text style={styles.deleteActionText}>Delete Document</Text>
                </TouchableOpacity>
              </View>

              {/* Related study lessons */}
              <View style={styles.lessonsSection}>
                <Text style={styles.sectionSubTitle}>Generated Lessons</Text>
                
                {lessons.length > 0 ? (
                  <View style={styles.lessonsList}>
                    {lessons.map(lesson => (
                      <TouchableOpacity
                        key={lesson.id}
                        style={styles.lessonListItem}
                        onPress={() => router.push(`/lesson/${lesson.id}`)}
                      >
                        <View style={styles.lessonInfo}>
                          <Text style={styles.lessonTitle} numberOfLines={1}>{lesson.title}</Text>
                          <Text style={styles.lessonProgress}>
                            {Math.round(lesson.progress * 100)}% complete
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#6e748a" />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noLessonsText}>No study lessons generated yet for this material.</Text>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    paddingBottom: 40,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  backLinkText: {
    color: '#d6c873',
    fontSize: 13,
    fontWeight: '600',
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
  layout: {
    flexDirection: 'row',
    gap: 32,
  },
  leftCol: {
    flex: 2,
  },
  rightCol: {
    flex: 1,
    minWidth: 320,
    gap: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e2e2e2',
    letterSpacing: -0.6,
  },
  metaSub: {
    fontSize: 13,
    color: '#6e748a',
    marginTop: 4,
  },
  processingBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(214, 200, 115, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(214, 200, 115, 0.25)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  bannerTexts: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d6c873',
    marginBottom: 4,
  },
  bannerDesc: {
    fontSize: 12,
    color: '#d1c1d7',
    opacity: 0.8,
    lineHeight: 18,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 16,
  },
  topicCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 12,
    padding: 20,
    display: 'flex' as any,
    flexDirection: 'column' as any,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  topicIndex: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d1c1d7',
    opacity: 0.5,
    letterSpacing: 1.0,
  },
  topicMasteryBadge: {
    backgroundColor: 'rgba(64, 129, 117, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(64, 129, 117, 0.2)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  topicMasteryText: {
    color: '#408175',
    fontSize: 9,
    fontWeight: '700',
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 8,
  },
  topicDesc: {
    fontSize: 13,
    color: '#d1c1d7',
    lineHeight: 18,
    opacity: 0.8,
    marginBottom: 20,
    flex: 1,
  },
  topicFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 'auto',
  },
  topicActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
  },
  topicActionText: {
    color: '#e2e2e2',
    fontSize: 11,
    fontWeight: '600',
  },
  crucibleBtn: {
    backgroundColor: 'rgba(255, 191, 0, 0.06)',
    borderColor: 'rgba(255, 191, 0, 0.15)',
  },
  crucibleText: {
    color: '#FFBF00',
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    color: '#6e748a',
    fontSize: 13,
  },
  actionsBox: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  boxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6e748a',
  },
  infoVal: {
    fontSize: 13,
    color: '#e2e2e2',
    fontWeight: '500',
  },
  statusCompleted: {
    color: '#408175',
    fontWeight: '600',
  },
  statusProcessing: {
    color: '#d6c873',
    fontWeight: '600',
  },
  statusFailed: {
    color: '#ffb4ab',
    fontWeight: '600',
  },
  boxDivider: {
    height: 1,
    backgroundColor: 'rgba(245, 248, 255, 0.06)',
    marginVertical: 20,
  },
  primaryActionBtn: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    cursor: 'pointer' as any,
  },
  actionBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed' as any,
  },
  primaryActionText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '700',
  },
  deleteActionBtn: {
    backgroundColor: 'rgba(255, 180, 171, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.15)',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteActionText: {
    color: '#ffb4ab',
    fontSize: 13,
    fontWeight: '600',
  },
  lessonsSection: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  sectionSubTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 16,
  },
  lessonsList: {
    gap: 10,
  },
  lessonListItem: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer' as any,
  },
  lessonInfo: {
    flex: 1,
    marginRight: 12,
  },
  lessonTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  lessonProgress: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 4,
  },
  noLessonsText: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    paddingVertical: 12,
  },
});

const webStyles = {
  topicsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 16,
  },
};
