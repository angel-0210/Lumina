import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  ActivityIndicator,
  Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import { documentsApi, learningApi, apiErrorMessage, DocumentDetail } from '../../services/api';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleGenerateLesson = async () => {
    if (!doc) return;
    setGenerating(true);
    try {
      await learningApi.generateLesson(doc.id);
      Alert.alert(
        'Lesson Generation Initiated',
        'Lumina AI is generating study units and tutorial scenes for this document. You will be redirected to the Learn Hub to monitor progress.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/learn')
          }
        ]
      );
    } catch (err) {
      Alert.alert('Generation Failed', apiErrorMessage(err, 'Failed to generate study units.'));
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (id) {
      documentsApi.get(id)
        .then((res) => {
          setDoc(res);
        })
        .catch((err) => {
          Alert.alert('Error', apiErrorMessage(err, 'Failed to fetch document details.'));
          router.back();
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [id]);

  const handleDelete = () => {
    if (!doc) return;
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete ${doc.title}? This will erase all generated topics, lessons, and mastery progress.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await documentsApi.delete(doc.id);
              Alert.alert('Deleted', 'Document deleted successfully.');
              router.replace('/learn');
            } catch (err) {
              Alert.alert('Error', apiErrorMessage(err, 'Failed to delete document.'));
            } finally {
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#991bf7" />
          <Text style={styles.loadingText}>Fetching document details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!doc) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          disabled={deleting}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#b8bdd4" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Document Overview</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Document Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.docIconWrapper}>
            <Ionicons name="document-text" size={36} color="#dfb7ff" />
          </View>
          
          <Text style={styles.docTitle}>{doc.title}</Text>
          <Text style={styles.docMeta}>{doc.size} • Uploaded {doc.uploaded}</Text>
          
          <View style={[
            styles.statusBadge,
            doc.status === 'completed' ? styles.statusBadgeCompleted :
            doc.status === 'failed' ? styles.statusBadgeFailed : styles.statusBadgeProcessing
          ]}>
            <Ionicons 
              name={
                doc.status === 'completed' ? "checkmark-circle" :
                doc.status === 'failed' ? "alert-circle" : "sync-circle"
              } 
              size={14} 
              color={
                doc.status === 'completed' ? "#4caf50" :
                doc.status === 'failed' ? "#ffb4ab" : "#dfb7ff"
              } 
            />
            <Text style={[
              styles.statusText,
              doc.status === 'completed' ? styles.statusTextCompleted :
              doc.status === 'failed' ? styles.statusTextFailed : styles.statusTextProcessing
            ]}>{doc.status}</Text>
          </View>
        </View>

        {/* Topics List Header */}
        <Text style={styles.sectionTitle}>Detected Topics ({doc.topicsList?.length || 0})</Text>
        
        {/* Topics List */}
        <View style={styles.topicsContainer}>
          {!doc.topicsList || doc.topicsList.length === 0 ? (
            <Text style={styles.noTopicsText}>No study topics generated yet.</Text>
          ) : (
            doc.topicsList.map((topic) => (
              <View key={topic.id} style={styles.topicCard}>
                <View style={styles.topicHeader}>
                  <Text style={styles.topicName}>{topic.name}</Text>
                  <TouchableOpacity 
                    style={styles.topicActionButton}
                    onPress={() => router.push(`/mastery/${topic.id}`)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-forward" size={18} color="#dfb7ff" />
                  </TouchableOpacity>
                </View>
                {topic.desc ? <Text style={styles.topicDesc}>{topic.desc}</Text> : null}
                
                <View style={styles.topicActionsRow}>
                  <TouchableOpacity 
                    style={styles.actionPill} 
                    onPress={() => router.push(`/lesson/${topic.id}`)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="school" size={12} color="#dfb7ff" />
                    <Text style={styles.actionPillText}>Learn</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.actionPill} 
                    onPress={() => router.push('/test')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="flame" size={12} color="#dfb7ff" />
                    <Text style={styles.actionPillText}>Test</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Action Tray */}
        <View style={styles.actionTray}>
          {doc.status === 'completed' && (!doc.topicsList || doc.topicsList.length === 0) && (
            <Button
              title={generating ? "Generating study units…" : "Generate study units"}
              onPress={handleGenerateLesson}
              disabled={generating}
              loading={generating}
              showArrow={!generating}
            />
          )}

          <Button
            title="Explore File via Q&A"
            onPress={() => router.push('/explore')}
            showArrow
          />
          
          <TouchableOpacity 
            style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]} 
            onPress={handleDelete}
            disabled={deleting}
            activeOpacity={0.8}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#ffb4ab" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#ffb4ab" />
                <Text style={styles.deleteButtonText}>Delete Document</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(154, 140, 160, 0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f0f2f8',
  },
  headerSpacer: {
    width: 40,
  },
  scrollContainer: {
    padding: 20,
    flexGrow: 1,
  },
  statsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
  },
  docIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  docTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f2f8',
    textAlign: 'center',
    marginBottom: 6,
  },
  docMeta: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeCompleted: {
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  statusBadgeProcessing: {
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
    borderColor: 'rgba(153, 27, 247, 0.25)',
  },
  statusBadgeFailed: {
    backgroundColor: 'rgba(255, 180, 171, 0.08)',
    borderColor: 'rgba(255, 180, 171, 0.25)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusTextCompleted: {
    color: '#4caf50',
  },
  statusTextProcessing: {
    color: '#dfb7ff',
  },
  statusTextFailed: {
    color: '#ffb4ab',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
    marginBottom: 16,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  topicsContainer: {
    gap: 16,
    marginBottom: 28,
  },
  noTopicsText: {
    color: '#6e748a',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },
  topicCard: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 16,
    padding: 16,
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  topicName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
    flex: 1,
    marginRight: 8,
  },
  topicActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicDesc: {
    fontSize: 13,
    color: '#6e748a',
    lineHeight: 18,
    marginBottom: 14,
  },
  topicActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionPillText: {
    fontSize: 12,
    color: '#dfb7ff',
    fontWeight: '600',
  },
  actionTray: {
    gap: 12,
    marginTop: 'auto',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    backgroundColor: 'rgba(255, 180, 171, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.2)',
    borderRadius: 16,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    color: '#ffb4ab',
    fontSize: 14,
    fontWeight: '600',
  },
});
