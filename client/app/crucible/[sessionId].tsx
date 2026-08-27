import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Button
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { crucibleApi, apiErrorMessage, DialogueTurn, ConceptScoreOut } from '../../services/api';

export default function CrucibleSessionScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  
  const [turns, setTurns] = useState<DialogueTurn[]>([]);
  const [inputText, setInputText] = useState('');
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [maxTurns, setMaxTurns] = useState(5);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [topicName, setTopicName] = useState('');
  const [status, setStatus] = useState('started');

  // Grading results when concluded
  const [gradeResult, setGradeResult] = useState<{
    score: number;
    mastery: number;
    concepts: ConceptScoreOut[];
  } | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (sessionId) {
      crucibleApi.getSession(sessionId)
        .then((res) => {
          setTurns(res.turns || []);
          setTurnsUsed(res.turns.filter(t => t.role === 'student').length);
          setTopicName(res.topic);
          setStatus(res.status);
          if (res.status === 'completed') {
            setGradeResult({
              score: res.score,
              mastery: res.mastery * 100, // scale to percent
              concepts: res.concepts || []
            });
          }
        })
        .catch((err) => {
          Alert.alert('Error', apiErrorMessage(err, 'Failed to fetch assessment session.'));
          router.replace('/test');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [sessionId]);

  const handleSendResponse = async () => {
    const answer = inputText.trim();
    if (!answer || sending || !sessionId) return;

    setSending(true);
    setInputText('');

    // Optimistically add student's turn
    const studentTurn: DialogueTurn = {
      id: `std_${Date.now()}`,
      role: 'student',
      text: answer,
    };
    setTurns(prev => [...prev, studentTurn]);
    setTurnsUsed(prev => prev + 1);

    try {
      const res = await crucibleApi.respond(sessionId, answer);
      setMaxTurns(res.maxTurns);
      setTurnsUsed(res.turnsUsed);

      if (res.done) {
        setStatus('completed');
        setGradeResult({
          score: res.score || 0,
          mastery: (res.mastery || 0) * 100,
          concepts: res.concepts || []
        });

        Alert.alert(
          'Crucible Trial Concluded',
          `The examiner has evaluated your assertions.\nOverall Score: ${res.score}%\nMastery: ${Math.round((res.mastery || 0) * 100)}%`,
          [
            { text: 'View Scorecard', style: 'default' }
          ]
        );
      } else if (res.nextQuestion) {
        setTurns(prev => [...prev, res.nextQuestion!]);
      }
    } catch (err) {
      Alert.alert('Response Failed', apiErrorMessage(err, 'Failed to submit response to the examiner.'));
      // Remove optimistic turn on failure so user can try again
      setTurns(prev => prev.slice(0, -1));
      setTurnsUsed(prev => prev - 1);
      setInputText(answer);
    } finally {
      setSending(false);
    }
  };

  const handleTerminate = () => {
    if (status === 'completed') {
      router.replace('/test');
      return;
    }
    Alert.alert(
      'Terminate Trial',
      'Are you sure you want to end this Socratic examination? Active progress will not be indexed.',
      [
        { text: 'Resume Trial', style: 'cancel' },
        { text: 'Terminate', style: 'destructive', onPress: () => router.replace('/test') }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#991bf7" />
          <Text style={styles.loadingText}>Connecting to Crucible examiner...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Immersive Session Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={handleTerminate}
          activeOpacity={0.7}
        >
          <Ionicons name={status === 'completed' ? "arrow-back" : "close"} size={24} color="#b8bdd4" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{topicName || 'Concept Crucible'}</Text>
          <Text style={styles.turnTracker}>
            {status === 'completed' ? 'Examination Concluded' : `Query ${turnsUsed} of ${maxTurns}`}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Progress tracker bar */}
      {status !== 'completed' && (
        <View style={styles.progressTracker}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${(turnsUsed / maxTurns) * 100}%` }]} />
          </View>
        </View>
      )}

      {/* Socratic Dialogue Transcript Feed */}
      <ScrollView 
        contentContainerStyle={styles.dialogueFeed}
        showsVerticalScrollIndicator={false}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {turns.map((turn) => (
          <View 
            key={turn.id} 
            style={[
              styles.turnRow,
              turn.role === 'student' ? styles.studentRow : styles.examinerRow
            ]}
          >
            {turn.role === 'examiner' && (
              <View style={styles.avatarExaminer}>
                <Ionicons name="shield-checkmark" size={16} color="#dfb7ff" />
              </View>
            )}
            <View style={[
              styles.bubble,
              turn.role === 'student' ? styles.studentBubble : styles.examinerBubble
            ]}>
              <Text style={[
                styles.turnText,
                turn.role === 'student' ? styles.studentText : styles.examinerText
              ]}>
                {turn.text}
              </Text>
            </View>
          </View>
        ))}

        {sending && (
          <View style={[styles.turnRow, styles.examinerRow]}>
            <View style={styles.avatarExaminer}>
              <Ionicons name="shield-checkmark" size={16} color="#dfb7ff" />
            </View>
            <View style={[styles.bubble, styles.examinerBubble, styles.loadingBubble]}>
              <ActivityIndicator size="small" color="#dfb7ff" />
            </View>
          </View>
        )}

        {/* Scorecard visualization when concluded */}
        {gradeResult && (
          <View style={styles.scorecardContainer}>
            <Text style={styles.scorecardTitle}>Assessment Scorecard</Text>
            <View style={styles.scoreRow}>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreValue}>{gradeResult.score}%</Text>
                <Text style={styles.scoreLabel}>Overall Score</Text>
              </View>
              <View style={styles.scoreBox}>
                <Text style={styles.scoreValue}>{Math.round(gradeResult.mastery)}%</Text>
                <Text style={styles.scoreLabel}>Target Mastery</Text>
              </View>
            </View>

            <Text style={styles.conceptsTitle}>Concept Breakdown</Text>
            {gradeResult.concepts.map((concept, idx) => (
              <View key={idx} style={styles.conceptScoreCard}>
                <View style={styles.conceptHeader}>
                  <Text style={styles.conceptName}>{concept.name}</Text>
                  <Text style={styles.conceptMastery}>{concept.mastery}%</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${concept.mastery}%` }]} />
                </View>
                {concept.evidence ? (
                  <Text style={styles.conceptEvidence}>
                    <Text style={{fontWeight: '700'}}>Evidence: </Text>{concept.evidence}
                  </Text>
                ) : null}
              </View>
            ))}

            <Button 
              title="Conclude Examination"
              onPress={() => router.replace('/test')}
            />
          </View>
        )}
      </ScrollView>

      {/* Input tray for answers */}
      {status !== 'completed' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
          enabled={Platform.OS === 'ios'}
        >
          <View style={styles.inputTray}>
            <TextInput
              style={styles.inputField}
              placeholder="Formulate your Socratic assertion..."
              placeholderTextColor="rgba(209, 193, 215, 0.4)"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              editable={!sending}
            />
            <TouchableOpacity 
              style={[styles.sendButton, (!inputText.trim() || sending) && styles.sendButtonDisabled]} 
              onPress={handleSendResponse}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#6e748a',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
  },
  headerTitleContainer: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 14,
    color: '#f0f2f8',
    fontWeight: '600',
    textAlign: 'center',
  },
  turnTracker: {
    fontSize: 12,
    color: '#dfb7ff',
    fontWeight: '700',
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  progressTracker: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#1b1d26',
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#991bf7',
    borderRadius: 2,
  },
  dialogueFeed: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 20,
    flexGrow: 1,
  },
  turnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  studentRow: {
    justifyContent: 'flex-end',
  },
  examinerRow: {
    justifyContent: 'flex-start',
  },
  avatarExaminer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(153, 27, 247, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    padding: 14,
  },
  studentBubble: {
    backgroundColor: '#991bf7',
    borderTopRightRadius: 4,
  },
  examinerBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.06)',
    borderTopLeftRadius: 4,
  },
  loadingBubble: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  turnText: {
    fontSize: 14,
    lineHeight: 20,
  },
  studentText: {
    color: '#ffffff',
  },
  examinerText: {
    color: '#e2e2e2',
  },
  scorecardContainer: {
    marginTop: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  scorecardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f2f8',
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: 16,
  },
  scoreBox: {
    flex: 1,
    backgroundColor: 'rgba(153, 27, 247, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.15)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#dfb7ff',
  },
  scoreLabel: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 4,
  },
  conceptsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f2f8',
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  conceptScoreCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  conceptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conceptName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f2f8',
    flex: 1,
    marginRight: 8,
  },
  conceptMastery: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dfb7ff',
  },
  conceptEvidence: {
    fontSize: 12,
    color: '#6e748a',
    lineHeight: 18,
    marginTop: 4,
  },
  inputTray: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 140, 160, 0.08)',
    backgroundColor: '#0d1117',
    marginBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  inputField: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: '#f0f2f8',
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#991bf7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(153, 27, 247, 0.4)',
  },
});
