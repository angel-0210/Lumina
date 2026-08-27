import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { learningApi, Topic, LessonListItem, apiErrorMessage } from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebLearning() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLearningData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [topicsRes, lessonsRes] = await Promise.all([
        learningApi.listTopics(1, 50),
        learningApi.listLessons(1, 50),
      ]);
      
      setTopics(topicsRes.items);
      setLessons(lessonsRes.items);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to fetch learning content.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLearningData();
  }, []);

  return (
    <WebLayout>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Learning Center</Text>
          <Text style={styles.subtitle}>
            Explore Socratic topics generated from your materials. Build understanding indexes.
          </Text>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#dfb7ff" />
            <Text style={styles.loadingText}>Synthesizing study courses...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={32} color="#ffb4ab" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.layout}>
            {/* Left Column: Topics listing */}
            <View style={styles.leftCol}>
              <Text style={styles.sectionTitle}>Extracted Topics</Text>
              
              {topics.length > 0 ? (
                <View style={styles.topicsList}>
                  {topics.map((topic, index) => (
                    <View key={topic.id} style={styles.topicCard}>
                      <View style={styles.topicHeader}>
                        <View style={styles.topicIndexBadge}>
                          <Text style={styles.topicIndexText}>UNIT {index + 1}</Text>
                        </View>
                        <View style={styles.masteryBadge}>
                          <Ionicons name="ribbon-outline" size={12} color="#408175" />
                          <Text style={styles.masteryText}>
                            {Math.round(topic.mastery * 100)}% Mastered
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.topicTitle}>{topic.name}</Text>
                      <Text style={styles.topicSubject}>{topic.subject}</Text>
                      
                      <Text style={styles.topicDesc}>{topic.desc}</Text>

                      <View style={styles.topicMeta}>
                        <View style={styles.metaItem}>
                          <Ionicons name="book-outline" size={14} color="#6e748a" />
                          <Text style={styles.metaText}>{topic.lessonsCount} {topic.lessonsCount === 1 ? 'Lesson' : 'Lessons'}</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Ionicons name="document-text-outline" size={14} color="#6e748a" />
                          <Text style={styles.metaText} numberOfLines={1}>{topic.documentTitle}</Text>
                        </View>
                      </View>

                      <View style={styles.topicDivider} />

                      {/* Topic Actions */}
                      <View style={styles.topicActions}>
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() => router.push(`/mastery/${topic.id}`)}
                        >
                          <Ionicons name="git-network-outline" size={16} color="#dfb7ff" />
                          <Text style={styles.actionBtnText}>Explore Nodes</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.crucibleBtn]}
                          onPress={() => router.push('/crucible')}
                        >
                          <Ionicons name="flame-outline" size={16} color="#FFBF00" />
                          <Text style={[styles.actionBtnText, styles.crucibleText]}>Test Crucible</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="school-outline" size={48} color="#353535" />
                  <Text style={styles.emptyText}>No Socratic topics extracted yet.</Text>
                  <Text style={styles.emptySub}>
                    Upload PDF or text chapters in the Library to start vector analysis.
                  </Text>
                  <TouchableOpacity
                    style={styles.uploadCTA}
                    onPress={() => router.push('/documents')}
                  >
                    <Text style={styles.uploadCTAText}>Go to Library</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Right Column: Lessons list */}
            <View style={styles.rightCol}>
              <View style={styles.lessonsCard}>
                <Text style={styles.sectionTitle}>Generated Lessons</Text>
                
                {lessons.length > 0 ? (
                  <View style={styles.lessonsList}>
                    {lessons.map((lesson) => (
                      <TouchableOpacity
                        key={lesson.id}
                        style={styles.lessonItem}
                        onPress={() => router.push(`/lesson/${lesson.id}`)}
                      >
                        <View style={styles.lessonInfo}>
                          <Text style={styles.lessonTitleText} numberOfLines={1}>
                            {lesson.title}
                          </Text>
                          <Text style={styles.lessonSubjectText} numberOfLines={1}>
                            {lesson.subject}
                          </Text>
                        </View>
                        <View style={styles.lessonMeta}>
                          <View style={styles.progressRow}>
                            <View style={styles.progressBarTrack}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  { width: `${lesson.progress * 100}%` },
                                ]}
                              />
                            </View>
                            <Text style={styles.progressPct}>
                              {Math.round(lesson.progress * 100)}%
                            </Text>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#6e748a" />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyLessons}>
                    <Ionicons name="journal-outline" size={32} color="#353535" />
                    <Text style={styles.emptyLessonsText}>No generated lessons.</Text>
                    <Text style={styles.emptyLessonsSub}>
                      Open a document in the library and click "Generate Study Lesson" to construct lessons.
                    </Text>
                  </View>
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
  header: {
    marginBottom: 32,
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
    flex: 1.8,
  },
  rightCol: {
    flex: 1.2,
    minWidth: 320,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 20,
  },
  topicsList: {
    gap: 20,
  },
  topicCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  topicIndexBadge: {
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  topicIndexText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#dfb7ff',
    letterSpacing: 0.5,
  },
  masteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(64, 129, 117, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(64, 129, 117, 0.25)',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  masteryText: {
    color: '#408175',
    fontSize: 10,
    fontWeight: '700',
  },
  topicTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e2e2e2',
    marginBottom: 4,
  },
  topicSubject: {
    fontSize: 12,
    color: '#6e748a',
    fontWeight: '500',
    marginBottom: 16,
  },
  topicDesc: {
    fontSize: 14,
    color: '#d1c1d7',
    opacity: 0.8,
    lineHeight: 22,
    marginBottom: 20,
  },
  topicMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#6e748a',
    fontWeight: '500',
  },
  topicDivider: {
    height: 1,
    backgroundColor: 'rgba(245, 248, 255, 0.05)',
    marginBottom: 20,
  },
  topicActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 8,
    paddingVertical: 10,
    gap: 8,
    cursor: 'pointer' as any,
  },
  actionBtnText: {
    color: '#e2e2e2',
    fontSize: 12,
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
    borderRadius: 16,
    paddingVertical: 80,
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  emptySub: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  uploadCTA: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  uploadCTAText: {
    color: '#131313',
    fontWeight: '700',
    fontSize: 13,
  },
  lessonsCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  lessonsList: {
    gap: 12,
  },
  lessonItem: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    cursor: 'pointer' as any,
  },
  lessonInfo: {
    flex: 1.5,
    minWidth: 0,
  },
  lessonTitleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  lessonSubjectText: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 4,
  },
  lessonMeta: {
    flex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#1b1b1b',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#408175',
    borderRadius: 2,
  },
  progressPct: {
    fontSize: 11,
    color: '#6e748a',
    fontWeight: '500',
    minWidth: 28,
    textAlign: 'right',
  },
  emptyLessons: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  emptyLessonsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  emptyLessonsSub: {
    fontSize: 12,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
  },
});
