import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import {
  crucibleApi,
  learningApi,
  Topic,
  CrucibleSessionListItem,
  CrucibleSessionDetail,
  DialogueTurn,
  ConceptScoreOut,
  apiErrorMessage
} from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebCrucible() {
  const [sessions, setSessions] = useState<CrucibleSessionListItem[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingActive, setLoadingActive] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Session states
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<CrucibleSessionDetail | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [maxTurns, setMaxTurns] = useState(6);

  // Start Session Form states
  const [showStartForm, setShowStartForm] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Curious' | 'Student' | 'Expert'>('Student');

  const fetchList = async () => {
    try {
      setLoadingList(true);
      setError(null);
      const [sessRes, topicsRes] = await Promise.all([
        crucibleApi.listSessions(1),
        learningApi.listTopics(1, 50),
      ]);
      setSessions(sessRes.items);
      setTopics(topicsRes.items);
      if (topicsRes.items.length > 0) {
        setSelectedTopicId(topicsRes.items[0].id);
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to fetch assessment history.'));
    } finally {
      setLoadingList(false);
    }
  };

  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();

  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => {
    if (sessionId) {
      handleSelectSession(sessionId);
    }
  }, [sessionId]);

  const handleSelectSession = async (sessionId: string) => {
    try {
      setLoadingActive(true);
      setShowStartForm(false);
      setActiveSessionId(sessionId);
      const detail = await crucibleApi.getSession(sessionId);
      setActiveSession(detail);
      setTurnsUsed(detail.turns.length);
      // Backend details don't explicitly return maxTurns, let's estimate
      setMaxTurns(Math.max(6, detail.turns.length));
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to load session details.'));
    } finally {
      setLoadingActive(false);
    }
  };

  const handleOpenStartForm = () => {
    setActiveSessionId(null);
    setActiveSession(null);
    setShowStartForm(true);
  };

  const handleStartSession = async () => {
    if (!selectedTopicId) {
      alert('Please select a topic to assess.');
      return;
    }
    try {
      setLoadingActive(true);
      setError(null);
      const res = await crucibleApi.start(selectedTopicId, selectedDifficulty);
      
      setActiveSessionId(res.sessionId);
      
      // Optimistically populate the local session state from the API start response
      // to avoid a second network round-trip for the initial display.
      setActiveSession({
        id: res.sessionId,
        topic: res.topic,
        difficulty: res.difficulty,
        status: 'started',
        score: 0,
        date: new Date().toLocaleDateString(),
        turns: [res.question],
        mastery: 0,
        concepts: []
      });
      setTurnsUsed(res.turnsUsed);
      setMaxTurns(res.maxTurns);
      setShowStartForm(false);
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not start Crucible assessment. Please try again.'));
    } finally {
      setLoadingActive(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!activeSessionId || !currentAnswer.trim() || submittingReply) return;

    try {
      setSubmittingReply(true);
      const answerText = currentAnswer.trim();
      setCurrentAnswer('');
      
      // Optimitic local append of student answer
      const studentTurn: DialogueTurn = {
        id: Math.random().toString(),
        role: 'student',
        text: answerText
      };
      
      setActiveSession(prev => {
        if (!prev) return null;
        return {
          ...prev,
          turns: [...prev.turns, studentTurn]
        };
      });

      const res = await crucibleApi.respond(activeSessionId, answerText);
      setTurnsUsed(res.turnsUsed);
      setMaxTurns(res.maxTurns);

      if (res.done) {
        // Complete local session state
        setActiveSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'completed',
            score: res.score || 0,
            mastery: res.mastery || 0,
            concepts: res.concepts || []
          };
        });
        // Refresh session list history in left panel
        const sessRes = await crucibleApi.listSessions(1);
        setSessions(sessRes.items);
      } else if (res.nextQuestion) {
        // Append next examiner question
        setActiveSession(prev => {
          if (!prev) return null;
          return {
            ...prev,
            turns: [...prev.turns, res.nextQuestion!]
          };
        });
      }

    } catch (err) {
      alert(apiErrorMessage(err, 'AI failed to interpret response. Please try again.'));
    } finally {
      setSubmittingReply(false);
    }
  };

  return (
    <WebLayout>
      <View style={styles.container}>
        
        {/* Left Panel: Conversation History */}
        <View style={styles.leftPane}>
          <View style={styles.paneHeader}>
            <Text style={styles.paneTitle}>Concept Crucible</Text>
            <TouchableOpacity style={styles.newChatBtn} onPress={handleOpenStartForm}>
              <Ionicons name="add" size={18} color="#131313" />
              <Text style={styles.newChatText}>New Session</Text>
            </TouchableOpacity>
          </View>

          {loadingList ? (
            <View style={styles.paneCenter}>
              <ActivityIndicator color="#dfb7ff" />
            </View>
          ) : sessions.length === 0 ? (
            <View style={styles.paneCenter}>
              <Text style={styles.paneEmptyText}>No past sessions.</Text>
            </View>
          ) : (
            <ScrollView style={styles.sessionScroll} showsVerticalScrollIndicator={false}>
              {sessions.map(s => {
                const active = activeSessionId === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.sessionItem, active && styles.sessionItemActive]}
                    onPress={() => handleSelectSession(s.id)}
                  >
                    <View style={styles.sessionHeaderRow}>
                      <Ionicons
                        name="flame-outline"
                        size={14}
                        color={s.status === 'completed' ? '#408175' : '#FFBF00'}
                      />
                      <Text style={styles.sessionDate}>{s.date}</Text>
                    </View>
                    <Text style={styles.sessionTopic} numberOfLines={1}>{s.topic}</Text>
                    <View style={styles.sessionFooterRow}>
                      <Text style={styles.sessionMeta}>
                        {s.turns} turns • {s.status.toUpperCase()}
                      </Text>
                      {s.status === 'completed' && (
                        <Text style={styles.sessionScore}>Score {s.score}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Right Panel: Socratic Chat / Start Form */}
        <View style={styles.rightPane}>
          
          {showStartForm ? (
            /* Start Session Form */
            <View style={styles.formContainer}>
              <Ionicons name="ribbon-outline" size={48} color="#dfb7ff" style={styles.formIcon} />
              <Text style={styles.formTitle}>Concept Crucible Evaluation</Text>
              <Text style={styles.formSubtitle}>
                Initialize a Socratic dialogue. Lumina AI will probe your conceptual understanding with targeted questions.
              </Text>

              {/* Topic Select */}
              <View style={styles.field}>
                <Text style={styles.label}>Select Socratic Course Topic</Text>
                <select
                  style={styles.dropdown}
                  value={selectedTopicId}
                  onChange={e => setSelectedTopicId(e.target.value)}
                >
                  {topics.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
                  ))}
                </select>
              </View>

              {/* Difficulty Select */}
              <View style={styles.field}>
                <Text style={styles.label}>Select Socratic Examiner Level</Text>
                <View style={styles.difficultyGrid}>
                  {(['Curious', 'Student', 'Expert'] as const).map(diff => (
                    <TouchableOpacity
                      key={diff}
                      style={[
                        styles.diffOption,
                        selectedDifficulty === diff && styles.diffOptionActive
                      ]}
                      onPress={() => setSelectedDifficulty(diff)}
                    >
                      <Text style={[
                        styles.diffText,
                        selectedDifficulty === diff && styles.diffTextActive
                      ]}>{diff}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity style={styles.beginBtn} onPress={handleStartSession}>
                <Text style={styles.beginBtnText}>Begin Assessment</Text>
              </TouchableOpacity>
            </View>

          ) : activeSessionId && activeSession ? (
            /* Active Chat Session */
            <View style={styles.chatContainer}>
              
              {/* Chat Header */}
              <View style={styles.chatHeader}>
                <View>
                  <Text style={styles.chatTitle} numberOfLines={1}>{activeSession.topic}</Text>
                  <Text style={styles.chatSubtitle}>Difficulty: {activeSession.difficulty}</Text>
                </View>
                {activeSession.status !== 'completed' && (
                  <View style={styles.turnCounter}>
                    <Text style={styles.turnCounterText}>Turn {turnsUsed} of {maxTurns}</Text>
                  </View>
                )}
              </View>

              {loadingActive ? (
                <View style={styles.chatCenter}>
                  <ActivityIndicator size="large" color="#dfb7ff" />
                </View>
              ) : (
                /* Chat Messages / Score Card */
                <View style={styles.chatBody}>
                  {activeSession.status === 'completed' ? (
                    /* Final Graded Report Card */
                    <ScrollView style={styles.scorecardScroll} showsVerticalScrollIndicator={false}>
                      <View style={styles.scoreHeaderCard}>
                        <View style={styles.scoreRow}>
                          <View style={styles.scoreCol}>
                            <Text style={styles.scoreLabel}>OVERALL GRADE</Text>
                            <Text style={styles.scoreVal}>{activeSession.score}/100</Text>
                          </View>
                          <View style={styles.scoreDivider} />
                          <View style={styles.scoreCol}>
                            <Text style={styles.scoreLabel}>TOPIC MASTERY</Text>
                            <Text style={[styles.scoreVal, styles.masteryVal]}>
                              {Math.round(activeSession.mastery * 100)}%
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.scoreDesc}>
                          Crucible completed successfully. AI has mapped your conceptual strengths and evidence targets below.
                        </Text>
                      </View>

                      {/* Concept Evaluation Breakdown */}
                      <Text style={styles.conceptsSectionTitle}>Concept Scores</Text>
                      {activeSession.concepts && activeSession.concepts.length > 0 ? (
                        <View style={styles.conceptsList}>
                          {activeSession.concepts.map((c, idx) => (
                            <View key={idx} style={styles.conceptCard}>
                              <View style={styles.conceptCardHeader}>
                                <Text style={styles.conceptName}>{c.name}</Text>
                                <View style={styles.conceptScoreBadge}>
                                  <Text style={styles.conceptScoreText}>Score {c.score}</Text>
                                </View>
                              </View>
                              {c.evidence && <Text style={styles.conceptEvidence}>{c.evidence}</Text>}
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.noConceptsText}>No detailed concept breakdown generated.</Text>
                      )}
                    </ScrollView>
                  ) : (
                    /* Active Chat Dialogue turns */
                    <ScrollView
                      style={styles.dialogueScroll}
                      ref={ref => ref?.scrollToEnd({ animated: true })}
                      showsVerticalScrollIndicator={false}
                    >
                      {activeSession.turns.map((turn, idx) => {
                        const isExaminer = turn.role === 'examiner';
                        return (
                          <View
                            key={idx}
                            style={[
                              styles.messageBubble,
                              isExaminer ? styles.bubbleExaminer : styles.bubbleStudent
                            ]}
                          >
                            <View style={styles.bubbleHeader}>
                              <Text style={styles.bubbleSender}>
                                {isExaminer ? 'EXAMINER' : 'YOU'}
                              </Text>
                            </View>
                            <Text style={styles.bubbleText}>{turn.text}</Text>
                          </View>
                        );
                      })}
                      {submittingReply && (
                        <View style={[styles.messageBubble, styles.bubbleExaminer]}>
                          <Text style={styles.bubbleSender}>EXAMINER</Text>
                          <View style={styles.typingIndicator}>
                            <ActivityIndicator size="small" color="#dfb7ff" />
                            <Text style={styles.typingText}>Examiner is interpreting your reply...</Text>
                          </View>
                        </View>
                      )}
                    </ScrollView>
                  )}

                  {/* Input form if active */}
                  {activeSession.status !== 'completed' && (
                    <View style={styles.inputArea}>
                      <TextInput
                        style={styles.chatInput}
                        placeholder={submittingReply ? 'Waiting for Socratic examiner...' : 'Type your answer here...'}
                        placeholderTextColor="#6e748a"
                        value={currentAnswer}
                        onChangeText={setCurrentAnswer}
                        editable={!submittingReply}
                        multiline
                      />
                      <TouchableOpacity
                        style={[
                          styles.sendBtn,
                          (!currentAnswer.trim() || submittingReply) && styles.sendBtnDisabled
                        ]}
                        disabled={!currentAnswer.trim() || submittingReply}
                        onPress={handleSendAnswer}
                      >
                        <Ionicons name="send" size={16} color="#131313" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          ) : (
            /* Idle Screen */
            <View style={styles.idleContainer}>
              <Ionicons name="flame-outline" size={64} color="#353535" />
              <Text style={styles.idleTitle}>Crucible Socratic Arena</Text>
              <Text style={styles.idleSubtitle}>
                Select an assessment from the history or start a fresh session to test your knowledge index.
              </Text>
              <TouchableOpacity style={styles.beginBtn} onPress={handleOpenStartForm}>
                <Text style={styles.beginBtnText}>Start Socratic Dialogue</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </View>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
    height: 'calc(100vh - 134px)' as any,
  },
  leftPane: {
    flex: 0.9,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 280,
  },
  rightPane: {
    flex: 2,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  paneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  paneTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
    cursor: 'pointer' as any,
  },
  newChatText: {
    color: '#131313',
    fontSize: 11,
    fontWeight: '700',
  },
  paneCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paneEmptyText: {
    color: '#6e748a',
    fontSize: 13,
  },
  sessionScroll: {
    flex: 1,
  },
  sessionItem: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    cursor: 'pointer' as any,
  },
  sessionItemActive: {
    borderColor: 'rgba(223, 183, 255, 0.3)',
    backgroundColor: 'rgba(223, 183, 255, 0.02)',
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionDate: {
    fontSize: 11,
    color: '#6e748a',
  },
  sessionTopic: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 8,
  },
  sessionFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionMeta: {
    fontSize: 11,
    color: '#6e748a',
  },
  sessionScore: {
    fontSize: 11,
    color: '#408175',
    fontWeight: '700',
  },
  idleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  idleTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  idleSubtitle: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
  },
  formContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 64,
    maxWidth: 560,
    alignSelf: 'center',
    gap: 16,
  },
  formIcon: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e2e2e2',
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d1c1d7',
    marginBottom: 8,
  },
  dropdown: {
    width: '100%',
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    borderRadius: 8,
    color: '#e2e2e2',
    padding: 12,
    fontSize: 13,
    outline: 'none',
  } as any,
  difficultyGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  diffOption: {
    flex: 1,
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    cursor: 'pointer' as any,
  },
  diffOptionActive: {
    borderColor: '#dfb7ff',
    backgroundColor: 'rgba(223, 183, 255, 0.02)',
  },
  diffText: {
    color: '#6e748a',
    fontSize: 12,
    fontWeight: '600',
  },
  diffTextActive: {
    color: '#dfb7ff',
  },
  beginBtn: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  beginBtnText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '700',
  },
  chatContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  chatHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 248, 255, 0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    maxWidth: 320,
  },
  chatSubtitle: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 4,
  },
  turnCounter: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  turnCounterText: {
    fontSize: 11,
    color: '#dfb7ff',
    fontWeight: '600',
  },
  chatCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBody: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  dialogueScroll: {
    flex: 1,
    padding: 24,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  bubbleExaminer: {
    alignSelf: 'flex-start',
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
  },
  bubbleStudent: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(153, 27, 247, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.25)',
  },
  bubbleHeader: {
    marginBottom: 6,
  },
  bubbleSender: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 0.5,
  },
  bubbleText: {
    fontSize: 14,
    color: '#e2e2e2',
    lineHeight: 20,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  typingText: {
    fontSize: 12,
    color: '#6e748a',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 248, 255, 0.08)',
    gap: 12,
    alignItems: 'flex-end',
    backgroundColor: '#1f1f1f',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 8,
    color: '#e2e2e2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 13,
    maxHeight: 100,
    outlineWidth: 0 as any,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#dfb7ff',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
  sendBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed' as any,
  },
  scorecardScroll: {
    flex: 1,
    padding: 24,
  },
  scoreHeaderCard: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.06)',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  scoreCol: {
    alignItems: 'center',
    flex: 1,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 1.0,
    marginBottom: 6,
  },
  scoreVal: {
    fontSize: 28,
    fontWeight: '800',
    color: '#dfb7ff',
  },
  masteryVal: {
    color: '#408175',
  },
  scoreDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(245, 248, 255, 0.08)',
  },
  scoreDesc: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
  },
  conceptsSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 16,
  },
  conceptsList: {
    gap: 12,
    marginBottom: 32,
  },
  conceptCard: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
    borderRadius: 10,
    padding: 16,
  },
  conceptCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  conceptName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  conceptScoreBadge: {
    backgroundColor: 'rgba(223, 183, 255, 0.1)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  conceptScoreText: {
    color: '#dfb7ff',
    fontSize: 10,
    fontWeight: '700',
  },
  conceptEvidence: {
    fontSize: 12,
    color: '#6e748a',
    lineHeight: 18,
  },
  noConceptsText: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
  },
});
