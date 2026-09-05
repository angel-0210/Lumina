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
  ActivityIndicator,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { 
  learningApi, 
  mediaApi, 
  apiErrorMessage, 
  Lesson, 
  Scene, 
  MediaAsset 
} from '../../services/api';
import WebLessonPlayer from '../../web/pages/Learning/LearningDetail';

export default function LessonPlayerScreen() {
  if (Platform.OS === 'web') {
    return <WebLessonPlayer />;
  }
  return <MobileLessonPlayerScreen />;
}

function MobileLessonPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  
  // Media asset integration
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [generatingSceneIndex, setGeneratingSceneIndex] = useState<number | null>(null);
  const [generatingKind, setGeneratingKind] = useState<'image' | 'video' | null>(null);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [retrying, setRetrying] = useState(false);
  const [pollTimeout, setPollTimeout] = useState(false);

  const fetchLesson = async (showLoading = true) => {
    if (!id) return;
    if (showLoading) setLoading(true);
    try {
      const data = await learningApi.getLesson(id);
      setLesson(data);
      // If we have scenes or status is failed, stop polling.
      if ((data.scenes && data.scenes.length > 0) || data.status === 'failed') {
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

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    setPollTimeout(false);
    try {
      await learningApi.retryLesson(id);
      fetchLesson(true);
    } catch (err) {
      Alert.alert('Retry Failed', apiErrorMessage(err, 'Could not restart scene generation.'));
    } finally {
      setRetrying(false);
    }
  };

  const fetchMedia = async () => {
    if (!id) return;
    try {
      const res = await mediaApi.list(id);
      setMediaAssets(res.items);
    } catch (err) {
      // Media fetch is non-fatal — suppress silently.
    }
  };

  useEffect(() => {
    fetchLesson(true);
    fetchMedia();

    let pollCount = 0;
    const maxPolls = 15; // 60s max polling limit (15 * 4s)

    // Set up polling in case scenes are still generating
    pollRef.current = setInterval(() => {
      pollCount++;
      if (pollCount >= maxPolls) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setPollTimeout(true);
      }
      fetchLesson(false);
    }, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (jobPollRef.current) clearInterval(jobPollRef.current);
    };
  }, [id]);

  const startPollingJob = (jobId: string) => {
    if (jobPollRef.current) clearInterval(jobPollRef.current);
    setGenerationProgress(10);
    
    jobPollRef.current = setInterval(async () => {
      try {
        const job = await mediaApi.getJobStatus(jobId);
        setGenerationProgress(job.progress_pct || 15);
        
        if (job.status === 'completed') {
          if (jobPollRef.current) {
            clearInterval(jobPollRef.current);
            jobPollRef.current = null;
          }
          setGeneratingSceneIndex(null);
          setGeneratingKind(null);
          fetchMedia();
        } else if (job.status === 'failed') {
          if (jobPollRef.current) {
            clearInterval(jobPollRef.current);
            jobPollRef.current = null;
          }
          setGeneratingSceneIndex(null);
          setGeneratingKind(null);
          Alert.alert('Generation Failed', job.error_message || 'Could not generate visual.');
        }
      } catch (err) {
        // Ignore transient status fetch errors
      }
    }, 2500);
  };

  const handleGenerateVisual = async (sceneIndex: number, scene: Scene) => {
    setGeneratingSceneIndex(sceneIndex);
    const isAnimation = scene.visualType === 'animation';
    setGeneratingKind(isAnimation ? 'video' : 'image');
    setGenerationProgress(5);

    // Prompt structured to match back specifically to this scene index
    const prompt = `Scene ${sceneIndex + 1}: ${scene.concept}. ${scene.visualHint || ''}`;

    try {
      if (isAnimation) {
        const res = await mediaApi.generateVideo(prompt, '16:9', id);
        startPollingJob(res.job.job_id);
      } else {
        const res = await mediaApi.generateImage(prompt, id);
        startPollingJob(res.job.job_id);
      }
    } catch (err) {
      setGeneratingSceneIndex(null);
      setGeneratingKind(null);
      Alert.alert('Generation Failed', apiErrorMessage(err, 'Failed to request AI media asset.'));
    }
  };

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
        <Stack.Screen options={{ title: 'Lesson Player', headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#991bf7" />
          <Text style={styles.loadingText}>Loading lesson player...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!lesson) return null;

  // Handle explicit failure state or generation timeout
  if (lesson.status === 'failed' || (pollTimeout && (!lesson.scenes || lesson.scenes.length === 0))) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: 'Lesson Player', headerShown: false }} />
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#ffb4ab" />
          <Text style={[styles.loadingText, { color: '#ffb4ab', marginTop: 12 }]}>
            Unable to Create Lesson Scenes
          </Text>
          <Text style={styles.statusSubtext}>
            Lumina AI could not complete scene generation for this topic right now. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.navButton, { marginTop: 24, backgroundColor: 'rgba(223, 183, 255, 0.12)', borderColor: '#dfb7ff' }]}
            onPress={handleRetry}
            disabled={retrying}
            activeOpacity={0.8}
          >
            {retrying ? (
              <ActivityIndicator size="small" color="#dfb7ff" />
            ) : (
              <>
                <Ionicons name="refresh" size={18} color="#dfb7ff" />
                <Text style={{ color: '#dfb7ff', fontWeight: '700', fontSize: 14, marginLeft: 8 }}>Retry Scene Generation</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Handle case where lesson exists but scenes are still generating
  if (!lesson.scenes || lesson.scenes.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: 'Lesson Player', headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dfb7ff" />
          <Text style={styles.loadingText}>Generating tutorial scenes...</Text>
          <Text style={styles.statusSubtext}>Lumina AI is digesting document vectors and generating structured slides.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentScene = lesson.scenes[currentSceneIndex];
  const visualData = currentScene.visualData as any;
  const progressPercent = ((currentSceneIndex + 1) / lesson.scenes.length) * 100;

  // Look for a matching generated visual for this scene index
  const sceneAsset = mediaAssets.find(
    (asset) => asset.prompt && asset.prompt.includes(`Scene ${currentSceneIndex + 1}:`)
  );

  const isSceneGenerating = generatingSceneIndex === currentSceneIndex;

  // Convert VEO mp4 videos to animated gifs dynamically using Cloudinary format conversion
  let mediaUrl = sceneAsset?.url;
  if (mediaUrl && sceneAsset?.kind === 'video' && mediaUrl.toLowerCase().endsWith('.mp4')) {
    mediaUrl = mediaUrl.replace('/video/upload/', '/image/upload/');
    mediaUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('.')) + '.gif';
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Lesson Player', headerShown: false }} />
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
          {isSceneGenerating ? (
            /* Media Generating State */
            <View style={styles.mediaLoadingContainer}>
              <ActivityIndicator size="large" color="#dfb7ff" />
              <Text style={styles.mediaLoadingText}>
                {generatingKind === 'video' ? 'Generating VEO Animation…' : 'Generating Imagen Illustration…'}
              </Text>
              <View style={styles.mediaProgressBg}>
                <View style={[styles.mediaProgressFill, { width: `${generationProgress}%` }]} />
              </View>
              <Text style={styles.mediaProgressText}>{generationProgress}% Complete</Text>
            </View>
          ) : mediaUrl ? (
            /* Real AI-Generated Media Render */
            <View style={styles.mediaWrapper}>
              <Image 
                source={{ uri: mediaUrl }} 
                style={styles.mediaImage} 
                resizeMode="cover" 
              />
              <View style={styles.mediaBadge}>
                <Ionicons 
                  name={sceneAsset?.kind === 'video' ? 'film' : 'sparkles'} 
                  size={12} 
                  color="#dfb7ff" 
                />
                <Text style={styles.mediaBadgeText}>
                  {sceneAsset?.kind === 'video' ? 'VEO Video' : 'AI Imagen'}
                </Text>
              </View>
            </View>
          ) : (
            /* Fallback type-specific rich content viewport */
            <View style={styles.fallbackVisual}>
              {currentScene.visualType === 'code' && visualData?.snippet ? (
                /* Dynamic Code Block representation */
                <View style={styles.codeContainer}>
                  <View style={styles.codeHeader}>
                    <Ionicons name="code-slash" size={14} color="#6e748a" />
                    <Text style={styles.codeHeaderText}>
                      {visualData?.language || 'Code Snippet'}
                    </Text>
                  </View>
                  <ScrollView style={styles.codeScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.codeText}>{visualData?.snippet}</Text>
                  </ScrollView>
                </View>
              ) : currentScene.visualType === 'chart' && visualData?.points ? (
                /* Simulated Chart Block representation */
                <View style={styles.chartContainer}>
                  <Text style={styles.chartTitle}>{visualData?.title || 'Data Points'}</Text>
                  <View style={styles.chartMockGrid}>
                    {(visualData?.points || []).slice(0, 5).map((p: any, i: number) => {
                      const val = Number(p.value || p.val || 50);
                      const label = String(p.label || p.name || i);
                      return (
                        <View key={i} style={styles.chartMockCol}>
                          <View style={styles.chartMockBarContainer}>
                            <View style={[styles.chartMockBar, { height: `${Math.min(100, Math.max(10, val))}%` }]} />
                          </View>
                          <Text style={styles.chartLabel} numberOfLines={1}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (
                /* Standard Icon Viewport */
                <View style={styles.iconVisualBox}>
                  <Ionicons 
                    name={
                      currentScene.visualType === 'chart' ? "bar-chart-outline" :
                      currentScene.visualType === 'code' ? "code-slash-outline" :
                      currentScene.visualType === 'diagram' ? "git-network-outline" :
                      currentScene.visualType === 'animation' ? "play-circle-outline" :
                      "document-text-outline"
                    } 
                    size={64} 
                    color="#dfb7ff" 
                  />
                  <Text style={styles.conceptLabel}>{currentScene.concept}</Text>
                  <View style={styles.visualDetailsCard}>
                    <Text style={styles.visualHintText}>{currentScene.visualHint || 'Visual reference'}</Text>
                  </View>
                </View>
              )}

              {/* Generate AI Media Button Overlay */}
              {(currentScene.visualType === 'animation' || currentScene.visualType === 'diagram') && (
                <TouchableOpacity 
                  style={styles.aiGenerateButton}
                  onPress={() => handleGenerateVisual(currentSceneIndex, currentScene)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="sparkles" size={16} color="#ffffff" />
                  <Text style={styles.aiGenerateButtonText}>
                    {currentScene.visualType === 'animation' ? 'Generate VEO Animation' : 'Generate AI Image'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
    flex: 1.3,
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
    padding: 16,
    overflow: 'hidden',
  },
  conceptLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f2f8',
    marginTop: 14,
    textAlign: 'center',
  },
  visualDetailsCard: {
    marginTop: 10,
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
    flex: 0.7,
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

  /* Real AI Visual Styles */
  mediaWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(13, 17, 23, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mediaBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#dfb7ff',
  },

  /* AI Visual Generation loading styles */
  mediaLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  mediaLoadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f0f2f8',
    marginTop: 16,
    textAlign: 'center',
  },
  mediaProgressBg: {
    width: 160,
    height: 6,
    backgroundColor: '#1b1d26',
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  mediaProgressFill: {
    height: '100%',
    backgroundColor: '#dfb7ff',
    borderRadius: 3,
  },
  mediaProgressText: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 8,
  },

  /* Fallback Rich Visual Viewport Styles */
  fallbackVisual: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconVisualBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiGenerateButton: {
    position: 'absolute',
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#991bf7',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 6px rgba(153, 27, 247, 0.3)',
      },
      default: {
        shadowColor: '#991bf7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
    }),
    elevation: 4,
  },
  aiGenerateButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Rich Code Viewport style */
  codeContainer: {
    width: '100%',
    height: '80%',
    backgroundColor: '#07090e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.08)',
    overflow: 'hidden',
    padding: 12,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(154, 140, 160, 0.08)',
    paddingBottom: 6,
  },
  codeHeaderText: {
    color: '#6e748a',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700',
  },
  codeScroll: {
    flex: 1,
  },
  codeText: {
    color: '#b8bdd4',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },

  /* Rich Chart Viewport style */
  chartContainer: {
    width: '100%',
    height: '80%',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dfb7ff',
    marginBottom: 16,
  },
  chartMockGrid: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
    height: '70%',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(154, 140, 160, 0.2)',
    paddingBottom: 6,
  },
  chartMockCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartMockBarContainer: {
    width: 24,
    height: '85%',
    justifyContent: 'flex-end',
  },
  chartMockBar: {
    backgroundColor: '#991bf7',
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  chartLabel: {
    fontSize: 9,
    color: '#6e748a',
    marginTop: 6,
    width: 44,
    textAlign: 'center',
  },
});
