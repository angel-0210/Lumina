import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../../store';
import { dashboardApi, DashboardData, apiErrorMessage } from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebDashboard() {
  const user = useAppStore((state) => state.user);
  const sessionRestored = useAppStore((state) => state.sessionRestored);
  const accessToken = useAppStore((state) => state.accessToken);
  
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchAttempts, setFetchAttempts] = useState(0);
  const MAX_RETRY_ATTEMPTS = 3;

  const fetchDashboardData = async () => {
    try {
      // Safety guard: prevent infinite retry loops
      if (fetchAttempts >= MAX_RETRY_ATTEMPTS) {
        setError('Unable to load dashboard after multiple attempts. Please refresh the page.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      
      // Extra validation: ensure token exists before making request
      const token = useAppStore.getState().accessToken;
      if (!token) {
        setError('Authentication required. Please log in again.');
        setLoading(false);
        return;
      }

      const res = await dashboardApi.get();
      
      // Validate response structure before setting state
      if (!res) {
        setError('Received empty response from server. Please try again.');
        setLoading(false);
        return;
      }

      setData(res);
      setFetchAttempts(0); // Reset on success
    } catch (err) {
      setFetchAttempts(prev => prev + 1);
      const errorMsg = apiErrorMessage(err, 'Failed to retrieve dashboard details.');
      setError(errorMsg);
      console.error('[Dashboard] Fetch error on attempt', fetchAttempts + 1, ':', err);
    } finally {
      setLoading(false);
    }
  };

  // Only call fetchDashboardData after session is restored AND token exists
  useEffect(() => {
    if (sessionRestored && accessToken) {
      fetchDashboardData();
    }
  }, [sessionRestored, accessToken]);

  // Block rendering until session is restored
  if (!sessionRestored) {
    return (
      <WebLayout>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#dfb7ff" />
          <Text style={styles.loadingText}>Initializing session...</Text>
        </View>
      </WebLayout>
    );
  }

  // Block rendering if no access token after session restore
  if (!accessToken) {
    return (
      <WebLayout>
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle" size={36} color="#ffb4ab" />
          <Text style={styles.errorTitle}>Authentication Required</Text>
          <Text style={styles.errorText}>Please log in to access your dashboard.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => router.replace('/login')}>
            <Text style={styles.retryButtonText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </WebLayout>
    );
  }

  const getGreeting = () => {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'Initiate';

  const handleResumeStudy = () => {
    if (data?.continueLearning?.lessonId) {
      router.push(`/lesson/${data.continueLearning.lessonId}`);
    } else {
      router.push('/learn');
    }
  };

  const formattedDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <WebLayout>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Upper Greeting Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.dateText}>{formattedDate} • Focus Session</Text>
            <Text style={styles.greetingText}>{getGreeting()}, {displayName}.</Text>
          </View>
          <View style={styles.statsOverview}>
            <View style={styles.statChip}>
              <Ionicons name="document-text" size={16} color="#dfb7ff" />
              <Text style={styles.statVal}>{data?.documentCount ?? 0}</Text>
              <Text style={styles.statLabel}>Docs</Text>
            </View>
            <View style={styles.statChip}>
              <Ionicons name="school" size={16} color="#408175" />
              <Text style={styles.statVal}>{data?.topicCount ?? 0}</Text>
              <Text style={styles.statLabel}>Lessons</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#dfb7ff" />
            <Text style={styles.loadingText}>Fetching dashboard intelligence...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={36} color="#ffb4ab" />
            <Text style={styles.errorTitle}>Error Loading Dashboard</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchDashboardData}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Bento Grid */
          <View style={styles.bentoGrid}>
            
            {/* Left section (Continue & Recents) */}
            <View style={styles.bentoLeft}>
              
              {/* Continue learning hero card */}
              <View style={[styles.heroCard, { position: 'relative', overflow: 'hidden' } as any]}>
                <View style={styles.heroGlow} />
                
                <View style={styles.heroBody}>
                  <View style={styles.heroContent}>
                    <View style={styles.heroBadgeRow}>
                      <View style={styles.currentFocusBadge}>
                        <Text style={styles.currentFocusText}>CURRENT FOCUS</Text>
                      </View>
                      <View style={styles.insightBadge}>
                        <Ionicons name="flash" size={12} color="#FFBF00" />
                        <Text style={styles.insightBadgeText}>SMART INSIGHT</Text>
                      </View>
                    </View>

                    <Text style={styles.heroTitle}>
                      {data?.continueLearning?.title || 'No active study session'}
                    </Text>
                    <Text style={styles.heroDesc}>
                      {data?.continueLearning
                        ? `Continue analyzing concepts in "${data.continueLearning.subject}". AI suggests reviewing recent topics before entering the Crucible.`
                        : 'Upload a document or select a topic to initialize your learning session and begin AI-assisted study.'}
                    </Text>

                    <View style={styles.heroActions}>
                      <TouchableOpacity
                        style={styles.resumeBtn}
                        onPress={handleResumeStudy}
                      >
                        <Ionicons name="play" size={16} color="#131313" />
                        <Text style={styles.resumeBtnText}>
                          {data?.continueLearning ? 'Resume Study' : 'Start Learning'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.syllabusBtn}
                        onPress={() => router.push('/learn')}
                      >
                        <Text style={styles.syllabusBtnText}>View Syllabus</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.heroIllustrationWrapper}>
                    <Image
                      alt="Process Visualization"
                      style={styles.heroIllustration as any}
                      source={{
                        uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBCfJoQECEdv0pkb8bxVAU9yGqjzWcuwgPWd-CcKMbZSIWt8d5FANtf-7HLfRulzN49S1BJPfALSzfiv3IMHM5ltXEJBc9KxSCaQG9SRFR129Dyiax5k87Py7sb_vFpy7x2wsmOrmrDcSfI_nYFvHTgMBaELd1ekfVUIcO_lKI0VQPk1uF5Hml_b_Q2ZRm_8ROg1sOO-Hf4_e8hha66DCjIkdsasdQgioBcFIJClsqG82BE3dD6LVv1',
                      }}
                    />
                  </View>
                </View>

                {/* Emerald progress bar line */}
                <View style={styles.heroProgressTrack}>
                  <View
                    style={[
                      styles.heroProgressBar,
                      { width: `${(data?.continueLearning?.progress ?? 0) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              {/* Recent Documents section */}
              <View style={styles.recentSection}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Recent Documents</Text>
                  <TouchableOpacity onPress={() => router.push('/documents')}>
                    <View style={styles.viewAllRow}>
                      <Text style={styles.viewAllText}>View All</Text>
                      <Ionicons name="arrow-forward" size={14} color="#d6c873" />
                    </View>
                  </TouchableOpacity>
                </View>

                {data?.recentDocuments && data.recentDocuments.length > 0 ? (
                  <View style={webStyles.documentsGrid as any}>
                    {data.recentDocuments.slice(0, 4).map((doc) => {
                      // Ensure progress is a valid number
                      const progressPercent = Math.max(0, Math.min(100, (doc.progress ?? 0) * 100));
                      const dashOffset = 100 - progressPercent;

                      return (
                        <TouchableOpacity
                          key={doc.id}
                          style={styles.docCard}
                          onPress={() => router.push(`/documents/${doc.id}`)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.docCardHeader}>
                            {/* Circular Progress Ring */}
                            <View style={styles.progressRingWrapper}>
                              <svg 
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  transform: 'rotate(-90deg)',
                                } as any}
                                viewBox="0 0 36 36"
                              >
                                <path
                                  fill="none"
                                  stroke="rgba(245, 248, 255, 0.04)"
                                  strokeWidth="3"
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                                <path
                                  fill="none"
                                  stroke="#408175"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeDasharray="100, 100"
                                  strokeDashoffset={dashOffset}
                                  style={{
                                    transition: 'stroke-dashoffset 0.3s ease',
                                  }}
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                />
                              </svg>
                              <Text style={styles.progressRingVal}>
                                {Math.round(progressPercent)}%
                              </Text>
                            </View>
                            <Text style={styles.docCardDate}>{doc.date ?? 'N/A'}</Text>
                          </View>
                          <Text style={styles.docCardTitle} numberOfLines={1}>
                            {doc.title ?? 'Untitled'}
                          </Text>
                          <Text style={styles.docCardMeta} numberOfLines={1}>
                            {(doc.file_type ?? 'document').toUpperCase()} • {doc.topics ?? 0} {(doc.topics ?? 0) === 1 ? 'Topic' : 'Topics'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyDocumentsCard}>
                    <Ionicons name="document-text-outline" size={32} color="#393939" />
                    <Text style={styles.emptyDocsText}>
                      No documents available. Upload course materials to begin.
                    </Text>
                  </View>
                )}
              </View>

            </View>

            {/* Right section (Map & Mastery) */}
            <View style={styles.bentoRight}>
              
              {/* Understanding Map and AI assessment */}
              <View style={styles.mapCard}>
                <Text style={styles.mapCardTitle}>Understanding Map</Text>
                
                {/* AI Assessment Overlay */}
                <View style={[styles.assessmentBox, { animation: 'pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite' } as any]}>
                  <Ionicons name="sparkles" size={16} color="#B5B9F0" style={styles.assessmentIcon} />
                  <View style={styles.assessmentTextWrapper}>
                    <Text style={styles.assessmentLabel}>AI Assessment</Text>
                    <Text style={styles.assessmentText}>
                      Comprehension is solid in Concurrency topics. Review needed for virtual memory paging and cache hits.
                    </Text>
                  </View>
                </View>

                {/* Graph Visualization */}
                <View style={styles.graphViewport}>
                  <View style={webStyles.dotGridOverlay as any} />
                  <svg 
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: '100%',
                      height: '100%',
                    } as any}
                  >
                    <line x1="50%" y1="20%" x2="25%" y2="50%" stroke="rgba(64, 129, 117, 0.4)" strokeWidth="1.5" />
                    <line x1="50%" y1="20%" x2="75%" y2="50%" stroke="rgba(255, 191, 0, 0.4)" strokeWidth="1.5" />
                    <line x1="25%" y1="50%" x2="50%" y2="80%" stroke="rgba(154, 140, 160, 0.2)" strokeWidth="1.5" />
                    <line x1="75%" y1="50%" x2="50%" y2="80%" stroke="rgba(154, 140, 160, 0.2)" strokeWidth="1.5" />
                  </svg>
                  
                  <View style={styles.graphContainer}>
                    <View style={styles.nodeRow}>
                      <View style={[styles.graphNode, styles.nodeMastered]}>
                        <View style={[styles.nodeIndicator, styles.indicatorMastered]} />
                        <Text style={styles.nodeText}>CPU Sched</Text>
                      </View>
                    </View>
                    <View style={styles.nodeRowBetween}>
                      <View style={[styles.graphNode, styles.nodeMastered]}>
                        <View style={[styles.nodeIndicator, styles.indicatorMastered]} />
                        <Text style={styles.nodeText}>Threads</Text>
                      </View>
                      <View style={[styles.graphNode, styles.nodeReviewing]}>
                        <View style={[styles.nodeIndicator, styles.indicatorReviewing]} />
                        <Text style={styles.nodeText}>Paging</Text>
                      </View>
                    </View>
                    <View style={styles.nodeRow}>
                      <View style={[styles.graphNode, styles.nodeLocked]}>
                        <View style={[styles.nodeIndicator, styles.indicatorLocked]} />
                        <Text style={styles.nodeText}>I/O Systems</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.openMapBtn}
                  onPress={() => router.push('/learn')}
                >
                  <Text style={styles.openMapBtnText}>Open Full Map</Text>
                </TouchableOpacity>
              </View>

              {/* Mastery progress listing */}
              <View style={styles.masteryCard}>
                <Text style={styles.masteryTitle}>Mastery Overview</Text>
                {data?.masterySummary && data.masterySummary.length > 0 ? (
                  <View style={styles.masteryList}>
                    {data.masterySummary.slice(0, 4).map((m, idx) => {
                      const progress = Math.max(0, Math.min(100, (m.progress ?? 0) * 100));
                      return (
                        <View key={idx} style={styles.masteryItem}>
                          <View style={styles.masteryItemHeader}>
                            <Text style={styles.masteryItemName}>{m.subject ?? 'Unknown'}</Text>
                            <Text style={styles.masteryItemPct}>{Math.round(progress)}%</Text>
                          </View>
                          <View style={styles.masteryProgressBarTrack}>
                            <View
                              style={{
                                height: '100%',
                                borderRadius: 3,
                                width: `${progress}%`,
                                backgroundColor: m.color || '#dfb7ff',
                              } as any}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyMastery}>
                    <Ionicons name="analytics-outline" size={24} color="#393939" />
                    <Text style={styles.emptyMasteryText}>
                      No subjects evaluated yet. Complete Crucible sessions to track subject progress.
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 40,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d1c1d7',
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  greetingText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#e2e2e2',
    letterSpacing: -0.8,
  },
  statsOverview: {
    flexDirection: 'row',
    gap: 12,
  },
  statChip: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  statLabel: {
    fontSize: 12,
    color: '#6e748a',
  },
  centerContainer: {
    paddingVertical: 100,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#6e748a',
    fontSize: 14,
  },
  errorCard: {
    backgroundColor: 'rgba(255, 180, 171, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.15)',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    alignSelf: 'center',
    maxWidth: 480,
    marginTop: 40,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffb4ab',
  },
  errorText: {
    fontSize: 14,
    color: '#d1c1d7',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#ffb4ab',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#690005',
    fontWeight: '700',
    fontSize: 13,
  },
  bentoGrid: {
    display: 'flex' as any,
    flexDirection: 'row' as any,
    gap: 24,
    width: '100%',
  },
  bentoLeft: {
    flex: 2,
    display: 'flex' as any,
    flexDirection: 'column' as any,
    gap: 24,
  },
  bentoRight: {
    flex: 1,
    display: 'flex' as any,
    flexDirection: 'column' as any,
    gap: 24,
    minWidth: 320,
  },
  heroCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'linear-gradient(135deg, rgba(214, 200, 115, 0.08) 0%, transparent 60%)' as any,
    pointerEvents: 'none',
  },
  heroBody: {
    padding: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
  },
  heroContent: {
    flex: 1,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  currentFocusBadge: {
    backgroundColor: 'rgba(214, 200, 115, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(214, 200, 115, 0.25)',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  currentFocusText: {
    color: '#d6c873',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  insightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  insightBadgeText: {
    color: '#FFBF00',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e2e2e2',
    marginBottom: 12,
  },
  heroDesc: {
    fontSize: 14,
    color: '#d1c1d7',
    lineHeight: 22,
    marginBottom: 24,
    opacity: 0.8,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 12,
  },
  resumeBtn: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resumeBtnText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '700',
  },
  syllabusBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.15)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  syllabusBtnText: {
    color: '#e2e2e2',
    fontSize: 13,
    fontWeight: '600',
  },
  heroIllustrationWrapper: {
    width: 140,
    height: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    overflow: 'hidden',
  },
  heroIllustration: {
    width: '100%',
    height: '100%',
  },
  heroProgressTrack: {
    height: 2,
    backgroundColor: 'rgba(245, 248, 255, 0.06)',
    width: '100%',
  },
  heroProgressBar: {
    height: '100%',
    backgroundColor: '#408175',
  },
  recentSection: {},
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d6c873',
  },
  docCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 12,
    padding: 20,
    display: 'flex' as any,
    flexDirection: 'column' as any,
  },
  docCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressRingWrapper: {
    position: 'relative',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingVal: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  docCardDate: {
    fontSize: 11,
    color: '#6e748a',
  },
  docCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 6,
  },
  docCardMeta: {
    fontSize: 11,
    color: '#6e748a',
  },
  emptyDocumentsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 16,
    paddingVertical: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyDocsText: {
    color: '#6e748a',
    fontSize: 13,
  },
  mapCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
    display: 'flex' as any,
    flexDirection: 'column' as any,
  },
  mapCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 20,
  },
  assessmentBox: {
    backgroundColor: 'rgba(181, 185, 240, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(181, 185, 240, 0.2)',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  assessmentIcon: {
    marginTop: 2,
  },
  assessmentTextWrapper: {
    flex: 1,
  },
  assessmentLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B5B9F0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  assessmentText: {
    fontSize: 13,
    color: '#e2e2e2',
    lineHeight: 18,
    opacity: 0.9,
  },
  graphViewport: {
    height: 200,
    backgroundColor: '#131313',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 24,
  },
  graphContainer: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  nodeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  nodeRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  graphNode: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
  },
  nodeMastered: {
    borderColor: 'rgba(64, 129, 117, 0.5)',
  },
  nodeReviewing: {
    borderColor: 'rgba(255, 191, 0, 0.5)',
  },
  nodeLocked: {
    opacity: 0.5,
  },
  nodeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  indicatorMastered: {
    backgroundColor: '#408175',
  },
  indicatorReviewing: {
    backgroundColor: '#FFBF00',
  },
  indicatorLocked: {
    backgroundColor: '#6e748a',
  },
  nodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  openMapBtn: {
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.12)',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openMapBtnText: {
    color: '#e2e2e2',
    fontSize: 13,
    fontWeight: '600',
  },
  masteryCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  masteryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 20,
  },
  masteryList: {
    gap: 16,
  },
  masteryItem: {},
  masteryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  masteryItemName: {
    fontSize: 14,
    color: '#e2e2e2',
    fontWeight: '500',
  },
  masteryItemPct: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6e748a',
  },
  masteryProgressBarTrack: {
    height: 6,
    backgroundColor: '#131313',
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  masteryProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  emptyMastery: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  emptyMasteryText: {
    fontSize: 12,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
  },
});

const webStyles = {
  documentsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16,
  },
  dotGridOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255, 255, 255, 0.06) 1px, transparent 0)',
    backgroundSize: '24px 24px',
    opacity: 0.6,
  },
};
