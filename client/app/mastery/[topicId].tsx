import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Button from '../../components/Button';
import { masteryApi, apiErrorMessage, MasteryMap } from '../../services/api';

export default function MasteryMapScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const [mapData, setMapData] = useState<MasteryMap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (topicId) {
      masteryApi.map(topicId)
        .then((res) => {
          setMapData(res);
        })
        .catch((err) => {
          Alert.alert('Error', apiErrorMessage(err, 'Failed to fetch mastery map.'));
          router.back();
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [topicId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#991bf7" />
          <Text style={styles.loadingText}>Fetching understanding map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!mapData) return null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header bar */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#b8bdd4" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Understanding Map</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Topic Overview Card */}
        <View style={styles.overviewCard}>
          <Text style={styles.topicLabel}>Mastery Roadmap</Text>
          <Text style={styles.topicName}>{mapData.topicName}</Text>
          
          <View style={styles.progressContainer}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>Mastery Quotient</Text>
              <Text style={styles.progressPercent}>{Math.round(mapData.overallMastery * 100)}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${mapData.overallMastery * 100}%` }]} />
            </View>
          </View>
        </View>

        {/* Nodes Timeline Map */}
        <Text style={styles.sectionTitle}>Conceptual Nodes</Text>
        
        {mapData.concepts.length === 0 ? (
          <Text style={styles.noNodesText}>No concept nodes registered for this topic yet.</Text>
        ) : (
          <View style={styles.nodesTimeline}>
            {mapData.concepts.map((concept, index) => {
              const isCompleted = concept.status === 'Mastered';
              const isLocked = concept.status === 'Locked';
              const isReviewing = concept.status === 'Reviewing';

              return (
                <View key={concept.id} style={styles.nodeWrapper}>
                  {/* Visual Connector Line */}
                  {index < mapData.concepts.length - 1 && (
                    <View style={[
                      styles.connectorLine,
                      concept.progress > 0 && mapData.concepts[index + 1].status !== 'Locked' 
                        ? styles.connectorLineActive 
                        : null
                    ]} />
                  )}

                  {/* Node representation */}
                  <View style={styles.nodeItem}>
                    <View style={[
                      styles.nodeIconBox,
                      isCompleted && styles.nodeCompleted,
                      isReviewing && styles.nodeReviewing,
                      isLocked && styles.nodeLocked
                    ]}>
                      <Ionicons 
                        name={
                          isCompleted ? "checkmark-circle" :
                          isReviewing ? "school" : "lock-closed"
                        } 
                        size={20} 
                        color={
                          isCompleted ? "#4caf50" :
                          isReviewing ? "#dfb7ff" : "#6e748a"
                        } 
                      />
                    </View>

                    <View style={styles.nodeDetails}>
                      <Text style={[
                        styles.conceptTitle,
                        isLocked && styles.conceptTitleLocked
                      ]}>
                        {concept.name}
                      </Text>
                      
                      <Text style={styles.conceptStatus}>
                        {concept.status} • {Math.round(concept.progress * 100)}% Mastery
                      </Text>
                    </View>

                    {!isLocked && (
                      <TouchableOpacity 
                        style={styles.challengeButton}
                        onPress={() => router.push('/test')}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.challengeText}>Challenge</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Action Panel */}
        <View style={styles.actionPanel}>
          <Button 
            title="Accelerate Topic Mastery" 
            onPress={() => router.push('/learn')}
            showArrow
          />
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
  overviewCard: {
    backgroundColor: 'rgba(153, 27, 247, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.15)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
  },
  topicLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#dfb7ff',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  topicName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f0f2f8',
    marginBottom: 16,
  },
  progressContainer: {
    width: '100%',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#a0a5c0',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dfb7ff',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#1b1d26',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#991bf7',
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f0f2f8',
    marginBottom: 20,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  noNodesText: {
    color: '#6e748a',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
    marginBottom: 20,
  },
  nodesTimeline: {
    paddingLeft: 8,
    marginBottom: 28,
  },
  nodeWrapper: {
    position: 'relative',
    paddingBottom: 36,
  },
  connectorLine: {
    position: 'absolute',
    left: 20,
    top: 40,
    bottom: -8,
    width: 2,
    backgroundColor: '#1b1d26',
    zIndex: 0,
  },
  connectorLineActive: {
    backgroundColor: '#991bf7',
  },
  nodeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  nodeIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1b1d26',
  },
  nodeCompleted: {
    borderColor: '#4caf50',
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
  },
  nodeReviewing: {
    borderColor: '#991bf7',
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
  },
  nodeLocked: {
    borderColor: '#353b50',
    backgroundColor: '#13151c',
  },
  nodeDetails: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
  },
  conceptTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f2f8',
  },
  conceptTitleLocked: {
    color: '#6e748a',
  },
  conceptStatus: {
    fontSize: 12,
    color: '#6e748a',
    marginTop: 2,
  },
  challengeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  challengeText: {
    fontSize: 12,
    color: '#dfb7ff',
    fontWeight: '600',
  },
  actionPanel: {
    marginTop: 'auto',
  },
});
