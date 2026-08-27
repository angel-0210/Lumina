import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import { learningApi, crucibleApi, apiErrorMessage, Topic, CrucibleSessionListItem } from '../../services/api';

const DIFFICULTY_LEVELS = [
  { level: 'Curious', desc: 'Mild Socratic prompts. Great for basic recall.' },
  { level: 'Critical', desc: 'Deeper cross-examination. Identifies gaps.' },
  { level: 'Crucible', desc: 'Aggressive debate. Test your core assertions.' },
];

export default function TestHubScreen() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [recentSessions, setRecentSessions] = useState<CrucibleSessionListItem[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('Curious');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [topicsRes, sessionsRes] = await Promise.all([
        learningApi.listTopics(1, 100),
        crucibleApi.listSessions(),
      ]);
      setTopics(topicsRes.items);
      setRecentSessions(sessionsRes.items);

      if (topicsRes.items.length > 0 && !selectedTopicId) {
        setSelectedTopicId(topicsRes.items[0].id);
      }
    } catch {
      // Non-fatal.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedTopicId]);

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleStartSession = async () => {
    if (!selectedTopicId) {
      Alert.alert('Selection Required', 'Please select a topic before starting.');
      return;
    }
    setStarting(true);
    try {
      const res = await crucibleApi.start(selectedTopicId, selectedDifficulty);
      router.push(`/crucible/${res.sessionId}`);
    } catch (err) {
      Alert.alert('Failed to Start', apiErrorMessage(err, 'Could not initialize Socratic examination.'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#991bf7" colors={['#991bf7']} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Crucible</Text>
          <Text style={styles.screenSubtitle}>Test your understanding via Socratic dialogue</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#991bf7" />
            <Text style={styles.loadingText}>Fetching topics and sessions...</Text>
          </View>
        ) : topics.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="flame-outline" size={48} color="#353b50" />
            <Text style={styles.emptyText}>No topics available for assessment.</Text>
            <Text style={styles.emptySubtext}>Upload a study document and complete lesson generation to activate Crucible assessments.</Text>
          </View>
        ) : (
          <>
            {/* Topic Selector */}
            <Text style={styles.sectionTitle}>Select Assessment Topic</Text>
            <View style={styles.listContainer}>
              {topics.map((topic) => (
                <TouchableOpacity
                  key={topic.id}
                  style={[
                    styles.topicCard,
                    selectedTopicId === topic.id && styles.topicCardActive
                  ]}
                  onPress={() => setSelectedTopicId(topic.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.topicCardHeader}>
                    <Text style={[styles.topicName, selectedTopicId === topic.id && styles.topicNameActive]}>
                      {topic.name}
                    </Text>
                    {selectedTopicId === topic.id && (
                      <Ionicons name="checkmark-circle" size={18} color="#dfb7ff" />
                    )}
                  </View>
                  <Text style={styles.topicSubject}>{topic.documentTitle || topic.subject}</Text>
                  
                  <View style={styles.masteryBarWrapper}>
                    <View style={styles.masteryBarBg}>
                      <View style={[styles.masteryBarFill, { width: `${topic.mastery * 100}%` }]} />
                    </View>
                    <Text style={styles.masteryText}>{Math.round(topic.mastery * 100)}% Mastery</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Difficulty Selector */}
            <Text style={styles.sectionTitle}>Select Socratic Difficulty</Text>
            <View style={styles.difficultyContainer}>
              {DIFFICULTY_LEVELS.map((diff) => (
                <TouchableOpacity
                  key={diff.level}
                  style={[
                    styles.difficultyCard,
                    selectedDifficulty === diff.level && styles.difficultyCardActive
                  ]}
                  onPress={() => setSelectedDifficulty(diff.level)}
                  activeOpacity={0.8}
                >
                  <View style={styles.difficultyHeader}>
                    <Text style={[styles.difficultyLabel, selectedDifficulty === diff.level && styles.difficultyLabelActive]}>
                      {diff.level}
                    </Text>
                    <View style={[
                      styles.radioOuter,
                      selectedDifficulty === diff.level && styles.radioOuterActive
                    ]}>
                      {selectedDifficulty === diff.level && <View style={styles.radioInner} />}
                    </View>
                  </View>
                  <Text style={styles.difficultyDesc}>{diff.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action Button */}
            <Button 
              title={starting ? "Initializing Trial…" : "Begin Socratic Examination"} 
              onPress={handleStartSession}
              disabled={starting}
              loading={starting}
              showArrow={!starting}
            />

            {/* Recent Sessions */}
            {recentSessions.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, styles.sessionsTitle]}>Recent Assessment Sessions</Text>
                <View style={styles.listContainer}>
                  {recentSessions.map((sess) => (
                    <TouchableOpacity 
                      key={sess.id} 
                      style={styles.sessionCard}
                      onPress={() => router.push(`/crucible/${sess.id}`)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.sessionHeaderRow}>
                        <Text style={styles.sessionTopicName}>{sess.topic}</Text>
                        <Text style={styles.sessionScore}>
                          {sess.status === 'completed' ? `${sess.score}% Match` : 'In Progress'}
                        </Text>
                      </View>
                      <Text style={styles.sessionMetadata}>
                        {sess.turns} Socratic turns • {sess.date}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </>
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
    paddingBottom: 100, // account for floating bottom tab
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    color: '#6e748a',
    fontSize: 14,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.06)',
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#a0a5c0',
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
  },
  header: {
    marginBottom: 24,
    paddingTop: Platform.OS === 'android' ? 10 : 10,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f0f2f8',
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#6e748a',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
    marginBottom: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sessionsTitle: {
    marginTop: 28,
  },
  listContainer: {
    gap: 12,
    marginBottom: 24,
  },
  topicCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 16,
    padding: 16,
  },
  topicCardActive: {
    borderColor: 'rgba(153, 27, 247, 0.3)',
    backgroundColor: 'rgba(153, 27, 247, 0.02)',
  },
  topicCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  topicName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
  },
  topicNameActive: {
    color: '#dfb7ff',
  },
  topicSubject: {
    fontSize: 12,
    color: '#6e748a',
    marginBottom: 12,
  },
  masteryBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  masteryBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#1b1d26',
    borderRadius: 2,
    overflow: 'hidden',
  },
  masteryBarFill: {
    height: '100%',
    backgroundColor: '#991bf7',
    borderRadius: 2,
  },
  masteryText: {
    fontSize: 11,
    color: '#a0a5c0',
    fontWeight: '500',
  },
  difficultyContainer: {
    gap: 10,
    marginBottom: 20,
  },
  difficultyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
    borderRadius: 16,
    padding: 16,
  },
  difficultyCardActive: {
    borderColor: 'rgba(153, 27, 247, 0.25)',
    backgroundColor: 'rgba(153, 27, 247, 0.04)',
  },
  difficultyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  difficultyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a0a5c0',
  },
  difficultyLabelActive: {
    color: '#dfb7ff',
  },
  difficultyDesc: {
    fontSize: 12,
    color: '#6e748a',
    lineHeight: 16,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#353b50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterActive: {
    borderColor: '#991bf7',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#991bf7',
  },
  sessionCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sessionTopicName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f2f8',
  },
  sessionScore: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dfb7ff',
  },
  sessionMetadata: {
    fontSize: 11,
    color: '#6e748a',
  },
});
