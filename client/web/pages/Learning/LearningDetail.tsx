import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  learningApi,
  mediaApi,
  apiErrorMessage,
  Lesson,
  Scene,
  MediaAsset
} from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebLessonPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  
  // Media asset states
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [generatingSceneIndex, setGeneratingSceneIndex] = useState<number | null>(null);
  const [generatingKind, setGeneratingKind] = useState<'image' | 'video' | null>(null);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLesson = async (showLoading = true) => {
    if (!id) return;
    if (showLoading) setLoading(true);
    try {
      const data = await learningApi.getLesson(id);
      setLesson(data);
      if ((data.scenes && data.scenes.length > 0) || data.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to retrieve lesson.'));
      router.back();
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchMedia = async () => {
    if (!id) return;
    try {
      const res = await mediaApi.list(id);
      setMediaAssets(res.items);
    } catch {
      // Suppress silent media fetch failures
    }
  };

  useEffect(() => {
    fetchLesson(true);
    fetchMedia();

    let pollCount = 0;
    const maxPolls = 15; // 60s max polling limit

    // Poll for scenes if not generated yet
    pollRef.current = setInterval(() => {
      pollCount++;
      if (pollCount >= maxPolls) {
        if (pollRef.current) clearInterval(pollRef.current);
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
          alert(job.error_message || 'Could not generate visual.');
        }
      } catch {
        // Suppress polling errors
      }
    }, 2500);
  };

  const handleGenerateVisual = async (sceneIndex: number, scene: Scene) => {
    setGeneratingSceneIndex(sceneIndex);
    const isAnimation = scene.visualType === 'animation';
    setGeneratingKind(isAnimation ? 'video' : 'image');
    setGenerationProgress(5);

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
      alert(apiErrorMessage(err, 'Failed to request AI media asset.'));
    }
  };

  const handleNext = () => {
    if (!lesson || !lesson.scenes) return;
    if (currentSceneIndex < lesson.scenes.length - 1) {
      setCurrentSceneIndex(prev => prev + 1);
    } else {
      alert(`Lesson Completed! You have completed all scenes for "${lesson.title}".`);
      router.replace('/learn');
    }
  };

  const handlePrev = () => {
    if (currentSceneIndex > 0) {
      setCurrentSceneIndex(prev => prev - 1);
    }
  };

  if (loading) {
    return (
      <WebLayout>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#dfb7ff" />
          <Text style={styles.loadingText}>Initializing Socratic player...</Text>
        </View>
      </WebLayout>
    );
  }

  if (!lesson) return null;

  if (lesson.status === 'failed') {
    return (
      <WebLayout>
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#ffb4ab" />
          <Text style={[styles.loadingText, { color: '#ffb4ab', marginTop: 12 }]}>
            Slide Synthesis Failed
          </Text>
          <Text style={styles.loadingSub}>
            Lumina AI could not complete scene generation for this lesson. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { marginTop: 20, backgroundColor: 'rgba(223, 183, 255, 0.1)', borderColor: '#dfb7ff' }]}
            onPress={() => fetchLesson(true)}
          >
            <Ionicons name="refresh" size={16} color="#dfb7ff" />
            <Text style={{ color: '#dfb7ff', fontWeight: '600', fontSize: 13 }}>Retry Slide Generation</Text>
          </TouchableOpacity>
        </View>
      </WebLayout>
    );
  }

  if (!lesson.scenes || lesson.scenes.length === 0) {
    return (
      <WebLayout>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#dfb7ff" />
          <Text style={styles.loadingText}>Synthesizing custom Socratic slides...</Text>
          <Text style={styles.loadingSub}>
            Lumina is analyzing document vectors and structuring learning scenes.
          </Text>
        </View>
      </WebLayout>
    );
  }

  const currentScene = lesson.scenes[currentSceneIndex];
  const visualData = currentScene.visualData as any;
  const progressPercent = ((currentSceneIndex + 1) / lesson.scenes.length) * 100;

  // Search for matching media asset
  const sceneAsset = mediaAssets.find(
    (asset) => asset.prompt && asset.prompt.includes(`Scene ${currentSceneIndex + 1}:`)
  );
  
  const isSceneGenerating = generatingSceneIndex === currentSceneIndex;
  
  let mediaUrl = sceneAsset?.url;
  if (mediaUrl && sceneAsset?.kind === 'video' && mediaUrl.toLowerCase().endsWith('.mp4')) {
    mediaUrl = mediaUrl.replace('/video/upload/', '/image/upload/');
    mediaUrl = mediaUrl.substring(0, mediaUrl.lastIndexOf('.')) + '.gif';
  }

  return (
    <WebLayout>
      <View style={styles.container}>
        {/* Top Controls Header */}
        <View style={styles.playerHeader}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#d6c873" />
            <Text style={styles.backButtonText}>Exit Player</Text>
          </TouchableOpacity>
          
          <View style={styles.titleArea}>
            <Text style={styles.lessonSubject}>{lesson.subject}</Text>
            <Text style={styles.lessonTitle}>{lesson.title}</Text>
          </View>
          
          <View style={styles.sceneIndicator}>
            <Text style={styles.sceneIndicatorText}>Scene {currentSceneIndex + 1} of {lesson.scenes.length}</Text>
          </View>
        </View>

        {/* Progress Tracker bar */}
        <View style={styles.trackerContainer}>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>

        {/* Viewport Core split */}
        <View style={styles.viewportSplit}>
          
          {/* Left panel: Visual frame */}
          <View style={styles.viewportVisual}>
            <View style={styles.visualGlass}>
              {isSceneGenerating ? (
                <View style={styles.mediaLoading}>
                  <ActivityIndicator size="large" color="#dfb7ff" />
                  <Text style={styles.mediaLoadingLabel}>
                    {generatingKind === 'video' ? 'Synthesizing VEO Video...' : 'Drawing Imagen visual...'}
                  </Text>
                  <View style={styles.mediaProgressTrack}>
                    <View style={[styles.mediaProgressBar, { width: `${generationProgress}%` }]} />
                  </View>
                  <Text style={styles.mediaProgressVal}>{generationProgress}% complete</Text>
                </View>
              ) : mediaUrl ? (
                <View style={styles.mediaWrapper}>
                  <Image source={{ uri: mediaUrl }} style={styles.mediaImage} resizeMode="contain" />
                  <View style={styles.mediaBadge}>
                    <Ionicons name={sceneAsset?.kind === 'video' ? 'film' : 'sparkles'} size={12} color="#dfb7ff" />
                    <Text style={styles.mediaBadgeText}>
                      {sceneAsset?.kind === 'video' ? 'VEO Animation' : 'AI Imagen'}
                    </Text>
                  </View>
                </View>
              ) : (
                /* Fallback Types */
                <View style={styles.fallbackVisual}>
                  {currentScene.visualType === 'code' && visualData?.snippet ? (
                    <View style={styles.codeBlock}>
                      <View style={styles.codeHeader}>
                        <Ionicons name="code-slash" size={14} color="#6e748a" />
                        <Text style={styles.codeHeaderText}>{visualData?.language || 'Snippet'}</Text>
                      </View>
                      <ScrollView style={styles.codeScroll} showsVerticalScrollIndicator={false}>
                        <code style={webStyles.rawCode as any}>{visualData.snippet}</code>
                      </ScrollView>
                    </View>
                  ) : currentScene.visualType === 'chart' && visualData?.points ? (
                    <View style={styles.chartBlock}>
                      <Text style={styles.chartTitle}>{visualData.title || 'Extracted Vitals'}</Text>
                      <View style={styles.chartBars}>
                        {(visualData.points || []).map((p: any, i: number) => {
                          const val = Number(p.value || p.val || 50);
                          const label = String(p.label || p.name || i);
                          return (
                            <View key={i} style={styles.chartCol}>
                              <View style={styles.barContainer}>
                                <View style={[styles.chartBarFill, { height: `${Math.min(100, Math.max(10, val))}%` }]} />
                              </View>
                              <Text style={styles.chartLabel} numberOfLines={1}>{label}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    /* Default Visual Placeholder */
                    <View style={styles.placeholderBox}>
                      <Ionicons
                        name={
                          currentScene.visualType === 'chart' ? 'bar-chart-outline' :
                          currentScene.visualType === 'code' ? 'code-slash-outline' :
                          currentScene.visualType === 'diagram' ? 'git-network-outline' :
                          currentScene.visualType === 'animation' ? 'play-circle-outline' :
                          'document-text-outline'
                        }
                        size={64}
                        color="#dfb7ff"
                      />
                      <Text style={styles.placeholderTitle}>{currentScene.concept}</Text>
                      <Text style={styles.placeholderHint}>{currentScene.visualHint || 'AI vector visualization reference.'}</Text>
                    </View>
                  )}

                  {/* Generate Button Overlay */}
                  {(currentScene.visualType === 'animation' || currentScene.visualType === 'diagram') && (
                    <TouchableOpacity
                      style={styles.generateBtn}
                      onPress={() => handleGenerateVisual(currentSceneIndex, currentScene)}
                    >
                      <Ionicons name="sparkles" size={14} color="#131313" />
                      <Text style={styles.generateBtnText}>
                        {currentScene.visualType === 'animation' ? 'Generate VEO Animation' : 'Generate Imagen Visual'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Right panel: Narration/Explanation info */}
          <View style={styles.viewportNarration}>
            <View style={styles.narrationCard}>
              <Text style={styles.narrationLabel}>CONCEPT EXPLANATION</Text>
              <Text style={styles.conceptName}>{currentScene.concept}</Text>
              
              <View style={styles.divider} />
              
              <ScrollView style={styles.narrationScroll} showsVerticalScrollIndicator={true}>
                <Text style={styles.narrationText}>{currentScene.explanation}</Text>
              </ScrollView>

              {/* Player footer buttons */}
              <View style={styles.playerControls}>
                <TouchableOpacity
                  style={[styles.ctrlBtn, currentSceneIndex === 0 && styles.ctrlBtnDisabled]}
                  disabled={currentSceneIndex === 0}
                  onPress={handlePrev}
                >
                  <Ionicons name="arrow-back" size={18} color={currentSceneIndex === 0 ? '#353535' : '#e2e2e2'} />
                  <Text style={[styles.ctrlBtnText, currentSceneIndex === 0 && styles.ctrlBtnTextDisabled]}>Previous</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.ctrlBtn, styles.nextBtn]} onPress={handleNext}>
                  <Text style={styles.nextBtnText}>
                    {currentSceneIndex === lesson.scenes.length - 1 ? 'Complete Study' : 'Next Scene'}
                  </Text>
                  <Ionicons
                    name={currentSceneIndex === lesson.scenes.length - 1 ? 'checkmark' : 'arrow-forward'}
                    size={18}
                    color="#131313"
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>

        </View>
      </View>
    </WebLayout>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    paddingVertical: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#6e748a',
    fontSize: 14,
  },
  loadingSub: {
    color: '#6e748a',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 320,
  },
  container: {
    flex: 1,
    display: 'flex' as any,
    flexDirection: 'column' as any,
    height: 'calc(100vh - 134px)' as any,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.06)',
  },
  backButtonText: {
    color: '#d6c873',
    fontSize: 12,
    fontWeight: '600',
  },
  titleArea: {
    alignItems: 'center',
  },
  lessonSubject: {
    fontSize: 11,
    color: '#6e748a',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.0,
  },
  lessonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e2e2',
    marginTop: 4,
  },
  sceneIndicator: {
    backgroundColor: '#1f1f1f',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  sceneIndicatorText: {
    fontSize: 12,
    color: '#dfb7ff',
    fontWeight: '600',
  },
  trackerContainer: {
    marginBottom: 24,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: '#1f1f1f',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#dfb7ff',
    borderRadius: 2,
  },
  viewportSplit: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
    minHeight: 0, // critical for nested flex scrolls
  },
  viewportVisual: {
    flex: 1.3,
  },
  viewportNarration: {
    flex: 0.9,
    minWidth: 320,
  },
  visualGlass: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    width: '100%',
    height: '100%',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaLoading: {
    alignItems: 'center',
    gap: 12,
  },
  mediaLoadingLabel: {
    fontSize: 14,
    color: '#e2e2e2',
    fontWeight: '600',
  },
  mediaProgressTrack: {
    width: 200,
    height: 4,
    backgroundColor: '#131313',
    borderRadius: 2,
    overflow: 'hidden',
  },
  mediaProgressBar: {
    height: '100%',
    backgroundColor: '#dfb7ff',
    borderRadius: 2,
  },
  mediaProgressVal: {
    fontSize: 11,
    color: '#6e748a',
  },
  mediaWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
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
    gap: 6,
    backgroundColor: 'rgba(19, 19, 19, 0.8)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  mediaBadgeText: {
    color: '#dfb7ff',
    fontSize: 9,
    fontWeight: '700',
  },
  fallbackVisual: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  codeBlock: {
    width: '100%',
    height: '80%',
    backgroundColor: '#0d0d0d',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.05)',
    padding: 16,
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 248, 255, 0.06)',
    paddingBottom: 8,
    marginBottom: 12,
  },
  codeHeaderText: {
    color: '#6e748a',
    fontSize: 11,
    fontWeight: '700',
  },
  codeScroll: {
    flex: 1,
  },
  chartBlock: {
    width: '100%',
    height: '80%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: {
    color: '#dfb7ff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 20,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    height: '60%',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 248, 255, 0.1)',
    paddingBottom: 8,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barContainer: {
    width: 20,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBarFill: {
    backgroundColor: '#408175',
    width: '100%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  chartLabel: {
    color: '#6e748a',
    fontSize: 10,
    marginTop: 8,
  },
  placeholderBox: {
    alignItems: 'center',
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e2e2e2',
    marginTop: 16,
    textAlign: 'center',
  },
  placeholderHint: {
    fontSize: 13,
    color: '#6e748a',
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 280,
  },
  generateBtn: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#dfb7ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  generateBtnText: {
    color: '#131313',
    fontSize: 12,
    fontWeight: '700',
  },
  narrationCard: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  narrationLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6e748a',
    letterSpacing: 1.5,
  },
  conceptName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e2e2e2',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(245, 248, 255, 0.06)',
    marginVertical: 16,
  },
  narrationScroll: {
    flex: 1,
    marginBottom: 20,
  },
  narrationText: {
    fontSize: 15,
    color: '#e2e2e2',
    lineHeight: 24,
    opacity: 0.95,
  },
  playerControls: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 'auto',
  },
  ctrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  ctrlBtnDisabled: {
    opacity: 0.25,
  },
  ctrlBtnText: {
    color: '#e2e2e2',
    fontSize: 13,
    fontWeight: '600',
  },
  ctrlBtnTextDisabled: {
    color: '#6e748a',
  },
  nextBtn: {
    backgroundColor: '#dfb7ff',
    borderColor: '#dfb7ff',
  },
  nextBtnText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '700',
  },
});

const webStyles = {
  rawCode: {
    color: '#d1c1d7',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    whiteSpace: 'pre-wrap',
  },
};
