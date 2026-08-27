import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../../store';
import { profileApi, apiErrorMessage } from '../../../services/api';
import WebLayout from '../../layouts/WebLayout';

export default function WebSettings() {
  const user = useAppStore((state) => state.user);
  const accessToken = useAppStore((state) => state.accessToken);
  const refreshToken = useAppStore((state) => state.refreshToken);
  const setAuth = useAppStore((state) => state.setAuth);
  const clearAuth = useAppStore((state) => state.clearAuth);

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Preference states
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [audioGuides, setAudioGuides] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await profileApi.get();
      setName(data.name || '');
      setEmail(data.email || '');
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'We couldn\'t load your profile. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      setErrorMsg('Display name is required.');
      return;
    }
    try {
      setSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      const updated = await profileApi.update(name.trim());
      
      // Update Zustand auth store state
      if (accessToken && user) {
        setAuth(accessToken, refreshToken, {
          ...user,
          name: updated.name,
          email: updated.email,
          subscription: updated.subscription
        });
      }
      setSuccessMsg('Profile updates saved successfully.');
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, 'We couldn\'t update your profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    router.replace('/login');
  };

  if (loading) {
    return (
      <WebLayout>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#dfb7ff" />
          <Text style={styles.loadingText}>Retrieving your profile...</Text>
        </View>
      </WebLayout>
    );
  }

  return (
    <WebLayout>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Workspace Settings</Text>
          <Text style={styles.subtitle}>
            Manage your personal profile, subscription tier, and system preferences.
          </Text>
        </View>

        <View style={styles.grid}>
          
          {/* Left Column: Profile & Security */}
          <View style={styles.leftCol}>
            
            {/* Profile Info */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Profile Information</Text>

              {errorMsg && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}
              {successMsg && (
                <View style={styles.successContainer}>
                  <Text style={styles.successText}>{successMsg}</Text>
                </View>
              )}
              
              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Alex Initiate"
                  placeholderTextColor="#6e748a"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={email}
                  editable={false}
                />
                <Text style={styles.fieldHelp}>Email address cannot be changed in autonomous workspaces.</Text>
              </View>

              <TouchableOpacity 
                style={[styles.saveBtn, saving && { opacity: 0.7 }]} 
                onPress={handleSaveProfile}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#131313" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Profile Updates</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Account Security */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Account Security</Text>
              <Text style={styles.cardSubtitle}>
                Authentication credentials are managed via Supabase identity provider.
              </Text>
              
              <TouchableOpacity
                style={styles.outlineActionBtn}
                onPress={() => alert('Password reset email dispatched.')}
              >
                <Ionicons name="key-outline" size={16} color="#e2e2e2" />
                <Text style={styles.outlineActionText}>Request Password Reset</Text>
              </TouchableOpacity>
            </View>

          </View>

          {/* Right Column: Subscription & Preferences */}
          <View style={styles.rightCol}>
            
            {/* Subscription Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Lumina Membership</Text>
              <View style={styles.tierBox}>
                <Text style={styles.tierLabel}>CURRENT TIER</Text>
                <Text style={styles.tierVal}>{(user?.subscription || 'Free').toUpperCase()}</Text>
              </View>

              <Text style={styles.tierDesc}>
                {user?.subscription === 'pro' || user?.subscription === 'enterprise'
                  ? 'Thank you for supporting Lumina. You have unlimited AI generation and Crucible assessment sessions.'
                  : 'Free membership includes 5 document uploads and 2 Crucible assessment cycles per day.'}
              </Text>

              {(!user?.subscription || user.subscription === 'free') && (
                <TouchableOpacity
                  style={styles.upgradeBtn}
                  onPress={() => alert('Subscription management module loading...')}
                >
                  <Ionicons name="sparkles" size={14} color="#131313" />
                  <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* General Preferences */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>General Preferences</Text>
              
              <View style={styles.prefList}>
                <View style={styles.prefRow}>
                  <View style={styles.prefTextCol}>
                    <Text style={styles.prefLabel}>Email Notifications</Text>
                    <Text style={styles.prefDesc}>Receive summaries of your daily Crucible assessments.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.switch, emailNotifs && styles.switchActive]}
                    onPress={() => setEmailNotifs(!emailNotifs)}
                  >
                    <View style={[webStyles.switchKnob as any, emailNotifs && webStyles.switchKnobActive as any]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.prefRow}>
                  <View style={styles.prefTextCol}>
                    <Text style={styles.prefLabel}>AI Audio Explanations</Text>
                    <Text style={styles.prefDesc}>Enable speech synthesis for Socratic dialogue questions.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.switch, audioGuides && styles.switchActive]}
                    onPress={() => setAudioGuides(!audioGuides)}
                  >
                    <View style={[webStyles.switchKnob as any, audioGuides && webStyles.switchKnobActive as any]} />
                  </TouchableOpacity>
                </View>

                <View style={styles.prefRow}>
                  <View style={styles.prefTextCol}>
                    <Text style={styles.prefLabel}>High Contrast Dark Mode</Text>
                    <Text style={styles.prefDesc}>Optimized dark palette to reduce eye fatigue.</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.switch, darkMode && styles.switchActive]}
                    onPress={() => setDarkMode(!darkMode)}
                  >
                    <View style={[webStyles.switchKnob as any, darkMode && webStyles.switchKnobActive as any]} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Log out CTA */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color="#ffb4ab" />
              <Text style={styles.logoutBtnText}>Log Out from Workspace</Text>
            </TouchableOpacity>

          </View>

        </View>
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
  grid: {
    flexDirection: 'row',
    gap: 32,
  },
  leftCol: {
    flex: 1,
    gap: 24,
  },
  rightCol: {
    flex: 1,
    gap: 24,
  },
  card: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e2e2',
    marginBottom: 16,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6e748a',
    lineHeight: 18,
    marginBottom: 16,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d1c1d7',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 8,
    color: '#e2e2e2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    fontSize: 13,
    outlineWidth: 0 as any,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  fieldHelp: {
    fontSize: 11,
    color: '#6e748a',
    marginTop: 6,
  },
  saveBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
  saveBtnText: {
    color: '#e2e2e2',
    fontSize: 13,
    fontWeight: '600',
  },
  outlineActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    cursor: 'pointer' as any,
  },
  outlineActionText: {
    color: '#e2e2e2',
    fontSize: 13,
    fontWeight: '600',
  },
  tierBox: {
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  tierLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  tierVal: {
    fontSize: 24,
    fontWeight: '800',
    color: '#dfb7ff',
  },
  tierDesc: {
    fontSize: 13,
    color: '#6e748a',
    lineHeight: 18,
    marginBottom: 20,
  },
  upgradeBtn: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    cursor: 'pointer' as any,
  },
  upgradeBtnText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '700',
  },
  prefList: {
    gap: 20,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prefTextCol: {
    flex: 1,
    paddingRight: 16,
  },
  prefLabel: {
    fontSize: 14,
    color: '#e2e2e2',
    fontWeight: '500',
  },
  prefDesc: {
    fontSize: 12,
    color: '#6e748a',
    marginTop: 4,
    lineHeight: 16,
  },
  switch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#131313',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    padding: 2,
    justifyContent: 'center',
    cursor: 'pointer' as any,
  },
  switchActive: {
    backgroundColor: '#408175',
    borderColor: '#408175',
  },
  logoutBtn: {
    backgroundColor: 'rgba(255, 180, 171, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer' as any,
  },
  logoutBtnText: {
    color: '#ffb4ab',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400,
    gap: 16,
  },
  loadingText: {
    color: '#6e748a',
    fontSize: 14,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 180, 171, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.16)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 13,
  },
  successContainer: {
    backgroundColor: 'rgba(64, 129, 117, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(64, 129, 117, 0.16)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#80cbc4',
    fontSize: 13,
  },
});

const webStyles = {
  switchKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6e748a',
    transition: 'all 0.2s ease',
  },
  switchKnobActive: {
    backgroundColor: '#ffffff',
    transform: 'translateX(20px)',
  },
};
