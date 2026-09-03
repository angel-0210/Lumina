import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store';
import { subscriptionApi, apiErrorMessage } from '../services/api';

interface ProUpgradeModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProUpgradeModal({ visible, onClose }: ProUpgradeModalProps) {
  const user = useAppStore((state) => state.user);
  const accessToken = useAppStore((state) => state.accessToken);
  const refreshToken = useAppStore((state) => state.refreshToken);
  const setAuth = useAppStore((state) => state.setAuth);

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAlreadyPro = user?.subscription?.toLowerCase() === 'pro' || user?.subscription?.toLowerCase() === 'enterprise';

  const handleUpgrade = async () => {
    setLoading(true);
    setError(null);
    try {
      const updatedProfile = await subscriptionApi.upgrade('pro');
      if (accessToken && user) {
        setAuth(accessToken, refreshToken, {
          ...user,
          subscription: updatedProfile.subscription,
        });
      }
      setSuccess(true);
    } catch (err) {
      setError(apiErrorMessage(err, 'We could not complete your upgrade. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    setError(null);
    onClose();
  };

  const features = [
    { title: 'VEO AI Video Generation', desc: 'Create animated 3D/visual scenes for your lessons.' },
    { title: 'AI Imagen Illustrations', desc: 'Generate high-res diagrams and conceptual artwork.' },
    { title: '100MB Upload Limits', desc: 'Process massive textbooks, lecture notes, and papers.' },
    { title: 'High-Priority RAG Indexing', desc: 'Faster chunking, vector embedding, and response times.' },
    { title: 'Advanced Crucible Analytics', desc: 'Detailed mastery tracking and examiner insights.' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.badgeRow}>
              <Ionicons name="sparkles" size={20} color="#dfb7ff" />
              <Text style={styles.badgeText}>LUMINA PRO</Text>
            </View>
            <TouchableOpacity onPress={handleClose} disabled={loading}>
              <Ionicons name="close-circle-outline" size={24} color="#6e748a" />
            </TouchableOpacity>
          </View>

          {success ? (
            <View style={styles.statusBox}>
              <Ionicons name="checkmark-circle" size={56} color="#408175" />
              <Text style={styles.statusTitle}>Welcome to Lumina Pro!</Text>
              <Text style={styles.statusSubtitle}>
                Your subscription has been activated. Enjoy unlimited AI media generation and expanded limits.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Explore Pro Features</Text>
              </TouchableOpacity>
            </View>
          ) : isAlreadyPro ? (
            <View style={styles.statusBox}>
              <Ionicons name="ribbon-outline" size={48} color="#dfb7ff" />
              <Text style={styles.statusTitle}>You are a Pro Member</Text>
              <Text style={styles.statusSubtitle}>
                Your account already has full access to Lumina Pro features.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.contentBox}>
              <Text style={styles.headline}>Supercharge Your Socratic Learning</Text>
              <Text style={styles.subheadline}>
                Unlock cutting-edge AI video generation, image diagrams, and priority processing.
              </Text>

              {/* Feature List */}
              <View style={styles.featureList}>
                {features.map((item, i) => (
                  <View key={i} style={styles.featureRow}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#dfb7ff" />
                    <View style={styles.featureTexts}>
                      <Text style={styles.featureTitle}>{item.title}</Text>
                      <Text style={styles.featureDesc}>{item.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color="#ffb4ab" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Upgrade Trigger */}
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleUpgrade}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#131313" />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#131313" />
                    <Text style={styles.primaryBtnText}>Upgrade to Pro — Instant Access</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: 'rgba(223, 183, 255, 0.25)',
    borderRadius: 24,
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(153, 27, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dfb7ff',
    letterSpacing: 1.0,
  },
  contentBox: {
    gap: 16,
  },
  headline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f0f2f8',
    letterSpacing: -0.3,
  },
  subheadline: {
    fontSize: 13,
    color: '#6e748a',
    lineHeight: 18,
    marginTop: -8,
  },
  featureList: {
    gap: 12,
    marginVertical: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureTexts: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  featureDesc: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 180, 171, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.2)',
    borderRadius: 10,
    padding: 12,
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 13,
    flex: 1,
  },
  primaryBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#dfb7ff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '700',
  },
  statusBox: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e2e2e2',
  },
  statusSubtitle: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
  },
});
