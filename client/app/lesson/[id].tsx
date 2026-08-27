import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView,
  TouchableOpacity, 
  Dimensions,
  Platform,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { learningApi, apiErrorMessage, Lesson, Scene } from '../../services/api';

const { width } = Dimensions.get('window');

export default function LessonPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLesson = async (showLoading = true) => {
    if (!id) return;
    if (showLoading) setLoading(true);
    try {
      const data = await learningApi.getLesson(id);
      setLesson(data);
      // If we have scenes, stop polling.
      if (data.scenes && data.scenes.length > 0) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err, 'Failed to load lesson.'));
      router.back();
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLesson(true);

    // Set up polling in case scenes are still generating
    pollRef.current = setInterval(() => {
      fetchLesson(false);
    }, 4000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [id]);

  const handleNext = () => {
    if (!lesson || !lesson.scenes) return;
    if (currentSceneIndex < lesson.scenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
    } else {
      Alert.alert(
        'Lesson Completed!',
        `You have completed all scenes for "${lesson.title}". Your topic understanding index has increased.`,
        [
          { text: 'Return to Learn Hub', onPress: () => router.replace('/learn') }
        ]
      );
    }
  };

  const handlePrev = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(prev => prev - 1);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#991bf7" />
          <Text style={styles.loadingText}>Loading lesson player...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!lesson) return null;

  // Handle case where lesson exists but scenes are still generating
  if (!lesson.scenes || lesson.scenes.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dfb7ff" />
          <Text style={styles.loadingText}>Generating tutorial scenes...</Text>
          <Text style={styles.statusSubtext}>Lumina AI is digesting document vectors and generating structured slides.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentScene = lesson.scenes[currentSceneIndex];
  const progressPercent = ((currentSceneIndex + 1) / lesson.scenes.length) * 100;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Immersive Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={24} color="#b8bdd4" />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={styles.lessonTitle}>{lesson.title}</Text>
          <Text style={styles.sceneIndicator}>Scene {currentSceneIndex + 1} of {lesson.scenes.length}</Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      {/* Immersive Scene Progress Indicator */}
      <View style={styles.progressTracker}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Animation/Visual viewport */}
      <View style={styles.visualViewport}>
        <View style={styles.visualGlassBox}>
          {/* Simulated Scene Graphic representation */}
          <Ionicons 
            name={
              currentScene.visualType === 'chart' ? "bar-chart-outline" :
              currentScene.visualType === 'code' ? "code-slash-outline" :
              currentScene.visualType === 'diagram' ? "git-network-outline" :
              currentScene.visualType === 'animation' ? "play-circle-outline" :
              "document-text-outline"
            } 
            size={80} 
            color="#dfb7ff" 
          />
          <Text style={styles.conceptLabel}>{currentScene.concept}</Text>
          <View style={styles.visualDetailsCard}>
            <Text style={styles.visualHintText}>{currentScene.visualHint || 'Visual reference metadata'}</Text>
          </View>
        </View>
      </View>

      {/* Narration panel details */}
      <View style={styles.narrationPanel}>
        <Text style={styles.narrationTitle}>Narration Concept</Text>
        <ScrollView style={styles.narrationScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.narrationText}>{currentScene.explanation}</Text>
        </ScrollView>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <TouchableOpacity 
          style={[styles.navButton, currentSceneIndex === 0 && styles.navButtonDisabled]}
          onPress={handlePrev}
          disabled={currentSceneIndex === 0}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={currentSceneIndex === 0 ? '#353b50' : '#ffffff'} />
          <Text style={[styles.navButtonText, currentSceneIndex === 0 && styles.navButtonTextDisabled]}>Previous</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.navButton, styles.nextButton]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {currentSceneIndex === lesson.scenes.length - 1 ? 'Finish' : 'Next'}
          </Text>
          <Ionicons 
            name={currentSceneIndex === lesson.scenes.length - 1 ? 'checkmark' : 'arrow-forward'} 
            size={20} 
            color="#ffffff" 
          />
        </TouchableOpacity>
      </View>
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
    padding: 24,
  },
  loadingText: {
    color: '#6e748a',
    fontSize: 14,
  },
  statusSubtext: {
    color: '#6e748a',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  topBar: {
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
  titleWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  lessonTitle: {
    fontSize: 14,
    color: '#6e748a',
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  sceneIndicator: {
    fontSize: 12,
    color: '#dfb7ff',
    fontWeight: '700',
    marginTop: 2,
  },
  topSpacer: {
    width: 40,
  },
  progressTracker: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#1b1d26',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#991bf7',
    borderRadius: 2,
  },
  visualViewport: {
    flex: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  visualGlassBox: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  conceptLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f2f8',
    marginTop: 20,
    textAlign: 'center',
  },
  visualDetailsCard: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.15)',
    borderRadius: 10,
  },
  visualHintText: {
    fontSize: 11,
    color: '#dfb7ff',
    textAlign: 'center',
  },
  narrationPanel: {
    flex: 0.8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
    padding: 20,
  },
  narrationTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6e748a',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  narrationScroll: {
    flex: 1,
  },
  narrationText: {
    fontSize: 15,
    color: '#e2e2e2',
    lineHeight: 22,
  },
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 140, 160, 0.08)',
    backgroundColor: '#0d1117',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.12)',
    paddingHorizontal: 16,
  },
  navButtonDisabled: {
    borderColor: 'rgba(154, 140, 160, 0.04)',
    backgroundColor: 'transparent',
  },
  navButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  navButtonTextDisabled: {
    color: '#353b50',
  },
  nextButton: {
    backgroundColor: '#991bf7',
    borderColor: '#991bf7',
    paddingHorizontal: 20,
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
