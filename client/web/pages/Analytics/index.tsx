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
import { analyticsApi, AnalyticsData, apiErrorMessage } from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await analyticsApi.get();
      setData(res);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to fetch analytics statistics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <WebLayout>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>System Analytics</Text>
          <Text style={styles.subtitle}>
            Monitor Socratic performance metrics, conceptual coverage, and AI rate limits.
          </Text>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#dfb7ff" />
            <Text style={styles.loadingText}>Compiling database analytics...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={32} color="#ffb4ab" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchAnalytics}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !data ? null : (
          <View style={styles.analyticsGrid}>
            
            {/* ROW 1: Key Metrics Grid */}
            <View style={webStyles.gridRow4 as any}>
              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardLabel}>CONCEPT MASTERY</Text>
                  <Ionicons name="ribbon-outline" size={16} color="#408175" />
                </View>
                <Text style={[styles.statCardVal, styles.emeraldText]}>
                  {data.conceptStats.total > 0
                    ? `${Math.round((data.conceptStats.mastered / data.conceptStats.total) * 100)}%`
                    : '0%'}
                </Text>
                <Text style={styles.statCardDesc}>
                  {data.conceptStats.mastered} of {data.conceptStats.total} concepts completed.
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardLabel}>CRUCIBLE ATTEMPTS</Text>
                  <Ionicons name="flame-outline" size={16} color="#dfb7ff" />
                </View>
                <Text style={styles.statCardVal}>{data.userActivity.crucibleSessions}</Text>
                <Text style={styles.statCardDesc}>
                  Average score: {Math.round(data.userActivity.averageScore)}/100
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardLabel}>SOCIATIC TURNS</Text>
                  <Ionicons name="chatbubbles-outline" size={16} color="#FFBF00" />
                </View>
                <Text style={styles.statCardVal}>{data.userActivity.totalTurns}</Text>
                <Text style={styles.statCardDesc}>
                  Target questions answered by student.
                </Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.statCardLabel}>INGESTED VOLUME</Text>
                  <Ionicons name="cloud-done-outline" size={16} color="#6e748a" />
                </View>
                <Text style={styles.statCardVal}>{formatBytes(data.documentStats.totalBytes)}</Text>
                <Text style={styles.statCardDesc}>
                  Across {data.documentStats.total} documents.
                </Text>
              </View>
            </View>

            {/* ROW 2: Concepts breakdown & AI Token Usage */}
            <View style={webStyles.gridRow2 as any}>
              {/* Concepts Distribution */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Conceptual Progress</Text>
                <View style={styles.conceptsBreakdown}>
                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownLabelCol}>
                      <View style={[styles.colorDot, styles.dotMastered]} />
                      <Text style={styles.breakdownName}>Mastered (Score &ge; 70)</Text>
                    </View>
                    <Text style={styles.breakdownVal}>{data.conceptStats.mastered}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownLabelCol}>
                      <View style={[styles.colorDot, styles.dotReviewing]} />
                      <Text style={styles.breakdownName}>Reviewing (Score &lt; 70)</Text>
                    </View>
                    <Text style={styles.breakdownVal}>{data.conceptStats.reviewing}</Text>
                  </View>
                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownLabelCol}>
                      <View style={[styles.colorDot, styles.dotLocked]} />
                      <Text style={styles.breakdownName}>Locked (No Score)</Text>
                    </View>
                    <Text style={styles.breakdownVal}>{data.conceptStats.locked}</Text>
                  </View>

                  <View style={styles.barChartContainer}>
                    <Text style={styles.barTitle}>Distribution Ratio</Text>
                    <View style={styles.progressStack}>
                      {data.conceptStats.total > 0 ? (
                        <>
                          <View style={[styles.progressSegment, styles.segmentMastered, { flex: data.conceptStats.mastered }]} />
                          <View style={[styles.progressSegment, styles.segmentReviewing, { flex: data.conceptStats.reviewing }]} />
                          <View style={[styles.progressSegment, styles.segmentLocked, { flex: data.conceptStats.locked }]} />
                        </>
                      ) : (
                        <View style={[styles.progressSegment, styles.segmentEmpty, { flex: 1 }]} />
                      )}
                    </View>
                  </View>
                </View>
              </View>

              {/* AI Token usage stats */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>AI Rates & Token Usage</Text>
                <View style={styles.tokensBreakdown}>
                  <View style={styles.tokenRow}>
                    <Text style={styles.tokenLabel}>Input Tokens</Text>
                    <Text style={styles.tokenVal}>{data.aiUsage.inputTokens.toLocaleString()}</Text>
                  </View>
                  <View style={styles.tokenRow}>
                    <Text style={styles.tokenLabel}>Output Tokens</Text>
                    <Text style={styles.tokenVal}>{data.aiUsage.outputTokens.toLocaleString()}</Text>
                  </View>
                  <View style={styles.tokenRow}>
                    <Text style={styles.tokenLabel}>Total AI Jobs Enqueued</Text>
                    <Text style={styles.tokenVal}>{data.aiUsage.totalJobs}</Text>
                  </View>

                  <View style={styles.jobTypeGrid}>
                    <View style={styles.jobTypeBox}>
                      <Text style={styles.jobLabel}>LESSON GEN</Text>
                      <Text style={styles.jobVal}>{data.aiUsage.sceneGeneration}</Text>
                    </View>
                    <View style={styles.jobTypeBox}>
                      <Text style={styles.jobLabel}>QUESTION GEN</Text>
                      <Text style={styles.jobVal}>{data.aiUsage.questionGeneration}</Text>
                    </View>
                    <View style={styles.jobTypeBox}>
                      <Text style={styles.jobLabel}>GRADING</Text>
                      <Text style={styles.jobVal}>{data.aiUsage.grading}</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* ROW 3: Document Status & System Failures */}
            <View style={webStyles.gridRow2 as any}>
              {/* Document Ingestion status */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Document Processing Status</Text>
                <View style={styles.ingestionStats}>
                  <View style={styles.ingestionRow}>
                    <Text style={styles.ingestionLabel}>Completed</Text>
                    <View style={styles.ingestionCountRow}>
                      <View style={[styles.statusDot, styles.dotCompleted]} />
                      <Text style={styles.ingestionVal}>{data.documentStats.completed}</Text>
                    </View>
                  </View>
                  <View style={styles.ingestionRow}>
                    <Text style={styles.ingestionLabel}>Processing</Text>
                    <View style={styles.ingestionCountRow}>
                      <View style={[styles.statusDot, styles.dotProcessing]} />
                      <Text style={styles.ingestionVal}>{data.documentStats.processing}</Text>
                    </View>
                  </View>
                  <View style={styles.ingestionRow}>
                    <Text style={styles.ingestionLabel}>Failed</Text>
                    <View style={styles.ingestionCountRow}>
                      <View style={[styles.statusDot, styles.dotFailed]} />
                      <Text style={styles.ingestionVal}>{data.documentStats.failed}</Text>
                    </View>
                  </View>
                  <View style={styles.ingestionRow}>
                    <Text style={styles.ingestionLabel}>Pending</Text>
                    <View style={styles.ingestionCountRow}>
                      <View style={[styles.statusDot, styles.dotPending]} />
                      <Text style={styles.ingestionVal}>{data.documentStats.pending}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Failures & Errors */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Errors & Failures Logs</Text>
                <View style={styles.errorsContainer}>
                  <View style={styles.errorRowBox}>
                    <Ionicons name="close-circle-outline" size={24} color="#ffb4ab" />
                    <View style={styles.errorTextCol}>
                      <Text style={styles.errorLabelText}>Document Processing Errors</Text>
                      <Text style={styles.errorCountText}>{data.errorsFailures.processingErrors} occurrences</Text>
                    </View>
                  </View>
                  <View style={styles.errorRowBox}>
                    <Ionicons name="warning-outline" size={24} color="#FFBF00" />
                    <View style={styles.errorTextCol}>
                      <Text style={styles.errorLabelText}>AI Generation Failures</Text>
                      <Text style={styles.errorCountText}>{data.errorsFailures.aiErrors} occurrences</Text>
                    </View>
                  </View>
                </View>
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
    padding: 32,
    alignItems: 'center',
    gap: 12,
    alignSelf: 'center',
    maxWidth: 400,
    marginTop: 40,
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#ffb4ab',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  retryBtnText: {
    color: '#690005',
    fontWeight: '700',
    fontSize: 12,
  },
  analyticsGrid: {
    gap: 24,
  },
  statCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 12,
    padding: 20,
  },
  statCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 0.8,
  },
  statCardVal: {
    fontSize: 28,
    fontWeight: '800',
    color: '#e2e2e2',
    marginBottom: 6,
  },
  emeraldText: {
    color: '#408175',
  },
  statCardDesc: {
    fontSize: 12,
    color: '#6e748a',
  },
  chartCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 20,
  },
  conceptsBreakdown: {
    gap: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabelCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotMastered: {
    backgroundColor: '#408175',
  },
  dotReviewing: {
    backgroundColor: '#FFBF00',
  },
  dotLocked: {
    backgroundColor: '#353535',
  },
  breakdownName: {
    fontSize: 13,
    color: '#d1c1d7',
    opacity: 0.9,
  },
  breakdownVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  barChartContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 248, 255, 0.05)',
    paddingTop: 16,
  },
  barTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  progressStack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#131313',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
  },
  segmentMastered: {
    backgroundColor: '#408175',
  },
  segmentReviewing: {
    backgroundColor: '#FFBF00',
  },
  segmentLocked: {
    backgroundColor: '#353535',
  },
  segmentEmpty: {
    backgroundColor: '#2a2a2a',
  },
  tokensBreakdown: {
    gap: 12,
  },
  tokenRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131313',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
  },
  tokenLabel: {
    fontSize: 13,
    color: '#6e748a',
    fontWeight: '500',
  },
  tokenVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dfb7ff',
  },
  jobTypeGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  jobTypeBox: {
    flex: 1,
    backgroundColor: '#131313',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
  },
  jobLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  jobVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  ingestionStats: {
    gap: 12,
  },
  ingestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#131313',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
  },
  ingestionLabel: {
    fontSize: 13,
    color: '#d1c1d7',
    fontWeight: '500',
  },
  ingestionCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotCompleted: {
    backgroundColor: '#408175',
  },
  dotProcessing: {
    backgroundColor: '#FFBF00',
  },
  dotFailed: {
    backgroundColor: '#ffb4ab',
  },
  dotPending: {
    backgroundColor: '#6e748a',
  },
  ingestionVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  errorsContainer: {
    gap: 16,
  },
  errorRowBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 10,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  errorTextCol: {
    flex: 1,
  },
  errorLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  errorCountText: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 4,
  },
});

const webStyles = {
  gridRow4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 20,
  },
  gridRow2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: 24,
  },
};
