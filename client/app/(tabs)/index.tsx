import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';
import { documentsApi, masteryApi, apiErrorMessage, DocumentListItem, MasterySummaryItem } from '../../services/api';

const { width } = Dimensions.get('window');

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  return 'Good evening,';
}

export default function HomeDashboard() {
  const accessToken = useAppStore((state) => state.accessToken);
  const user = useAppStore((state) => state.user);
  const sessionRestored = useAppStore((state) => state.sessionRestored);
  const clearAuth = useAppStore((state) => state.clearAuth);

  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [mastery, setMastery] = useState<MasterySummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Wait for session restore before redirecting
  if (sessionRestored && !accessToken) {
    return <Redirect href="/signup" />;
  }

  const fetchData = useCallback(async () => {
    try {
      const [docsRes, masteryRes] = await Promise.all([
        documentsApi.list(1, 5),
        masteryApi.summary(),
      ]);
      setDocuments(docsRes.items);
      setMastery(masteryRes);
    } catch {
      // Errors on dashboard are non-fatal; show empty state.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetchData();
    }
  }, [accessToken, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleLogout = async () => {
    clearAuth();
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'Initiate';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#991bf7"
            colors={['#991bf7']}
          />
        }
      >
        {/* Header Block */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>{getGreeting()}</Text>
            <Text style={styles.userName}>{displayName}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={24} color="#b8bdd4" />
          </TouchableOpacity>
        </View>

        {/* Learning Journey Roadmap */}
        <View style={styles.glassCard}>
          <Text style={styles.sectionTitle}>Your Learning Journey</Text>
          <View style={styles.roadmapRow}>
            <View style={styles.roadmapStep}>
              <View style={[styles.roadmapDot, documents.length > 0 && styles.roadmapDotCompleted]}>
                <Ionicons name="cloud-upload" size={14} color={documents.length > 0 ? '#ffffff' : '#6e748a'} />
              </View>
              <Text style={styles.roadmapLabel}>Upload</Text>
            </View>
            <View style={styles.roadmapLine} />
            <View style={styles.roadmapStep}>
              <View style={[styles.roadmapDot, styles.roadmapDotActive]}>
                <Ionicons name="school" size={14} color="#dfb7ff" />
              </View>
              <Text style={styles.roadmapLabel}>Learn</Text>
            </View>
            <View style={styles.roadmapLine} />
            <View style={styles.roadmapStep}>
              <View style={styles.roadmapDot}>
                <Ionicons name="chatbubbles-outline" size={14} color="#6e748a" />
              </View>
              <Text style={styles.roadmapLabel}>Explore</Text>
            </View>
            <View style={styles.roadmapLine} />
            <View style={styles.roadmapStep}>
              <View style={styles.roadmapDot}>
                <Ionicons name="flame-outline" size={14} color="#6e748a" />
              </View>
              <Text style={styles.roadmapLabel}>Test</Text>
            </View>
          </View>
        </View>

        {/* Quick Action Upload Card */}
        <TouchableOpacity
          style={styles.uploadCTA}
          onPress={() => router.push('/documents/upload')}
          activeOpacity={0.8}
        >
          <View style={styles.uploadCTAContent}>
            <View style={styles.uploadIconWrapper}>
              <Ionicons name="cloud-upload-outline" size={24} color="#dfb7ff" />
            </View>
            <View style={styles.uploadCTATexts}>
              <Text style={styles.uploadCTATitle}>Upload New Material</Text>
              <Text style={styles.uploadCTASubtitle}>Support for PDF, TXT, or Markdown up to 50MB</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#b8bdd4" />
        </TouchableOpacity>

        {/* Recent Documents Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>Recent Documents</Text>
          <TouchableOpacity onPress={() => router.push('/learn')} activeOpacity={0.7}>
            <Text style={styles.sectionHeaderLink}>View All</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#991bf7" />
          </View>
        ) : documents.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-outline" size={32} color="#353b50" />
            <Text style={styles.emptyText}>No documents yet. Upload your first study material.</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContainer}
          >
            {documents.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={styles.documentCard}
                onPress={() => router.push(`/documents/${doc.id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.docHeader}>
                  <Ionicons name="document-text-outline" size={24} color="#dfb7ff" />
                  <Text style={styles.docDate}>{doc.date}</Text>
                </View>
                <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
                <Text style={styles.docInfo}>
                  {doc.size} • {doc.topics} {doc.topics === 1 ? 'Topic' : 'Topics'}
                </Text>

                {/* Progress indicator */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${doc.progress * 100}%` }]} />
                  </View>
                  <Text style={styles.progressText}>
                    {doc.status === 'completed'
                      ? `${Math.round(doc.progress * 100)}% Mastered`
                      : doc.status === 'processing'
                      ? 'Processing…'
                      : doc.status === 'failed'
                      ? 'Failed'
                      : 'Pending'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Mastery Overview Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>Mastery Overview</Text>
        </View>

        {mastery.length === 0 && !loading ? (
          <View style={styles.emptyCard}>
            <Ionicons name="analytics-outline" size={32} color="#353b50" />
            <Text style={styles.emptyText}>
              Complete a Crucible assessment to track mastery.
            </Text>
          </View>
        ) : (
          <View style={[styles.glassCard, styles.masteryCard]}>
            {mastery.map((subject, index) => (
              <View key={subject.subject} style={[styles.subjectRow, index > 0 && styles.subjectRowBorder]}>
                <View style={styles.subjectHeader}>
                  <Text style={styles.subjectName}>{subject.subject}</Text>
                  <Text style={styles.subjectPercent}>{Math.round(subject.progress * 100)}%</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${subject.progress * 100}%`,
                        backgroundColor: subject.color
                      }
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: Platform.OS === 'android' ? 10 : 0,
  },
  welcomeText: {
    fontSize: 14,
    color: '#6e748a',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f0f2f8',
    marginTop: 4,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
  },
  glassCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  roadmapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  roadmapStep: {
    alignItems: 'center',
    zIndex: 1,
  },
  roadmapDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1b1d26',
    borderWidth: 1.5,
    borderColor: '#353b50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roadmapDotCompleted: {
    backgroundColor: '#991bf7',
    borderColor: '#991bf7',
  },
  roadmapDotActive: {
    backgroundColor: '#1f1625',
    borderColor: '#dfb7ff',
  },
  roadmapLabel: {
    fontSize: 10,
    color: '#a0a5c0',
    marginTop: 6,
    fontWeight: '500',
  },
  roadmapLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#353b50',
    marginHorizontal: -4,
    marginTop: -16,
  },
  uploadCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.25)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  uploadCTAContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(153, 27, 247, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadCTATexts: {
    flex: 1,
  },
  uploadCTATitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#dfb7ff',
  },
  uploadCTASubtitle: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f0f2f8',
  },
  sectionHeaderLink: {
    fontSize: 13,
    color: '#dfb7ff',
    fontWeight: '500',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 20,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.06)',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
  },
  carouselContainer: {
    paddingRight: 20,
    gap: 16,
    marginBottom: 24,
  },
  documentCard: {
    width: width * 0.65,
    maxWidth: 240,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
    borderRadius: 16,
    padding: 16,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  docDate: {
    fontSize: 10,
    color: '#6e748a',
  },
  docTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
    marginBottom: 4,
  },
  docInfo: {
    fontSize: 12,
    color: '#6e748a',
    marginBottom: 16,
  },
  progressContainer: {
    marginTop: 'auto',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#1b1d26',
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#991bf7',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 10,
    color: '#a0a5c0',
    marginTop: 6,
    fontWeight: '500',
  },
  masteryCard: {
    paddingVertical: 10,
  },
  subjectRow: {
    paddingVertical: 12,
  },
  subjectRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 140, 160, 0.08)',
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectName: {
    fontSize: 14,
    color: '#f0f2f8',
    fontWeight: '500',
  },
  subjectPercent: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b8bdd4',
  },
});
