import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Switch,
  Alert,
  Platform,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useAppStore } from '../../store';
import { Redirect } from 'expo-router';
import { profileApi, notificationsApi, apiErrorMessage } from '../../services/api';
import ProUpgradeModal from '../../components/ProUpgradeModal';
import WebSettings from '../../web/pages/Settings';

export default function ProfileScreen() {
  const accessToken = useAppStore((state) => state.accessToken);
  const sessionRestored = useAppStore((state) => state.sessionRestored);

  if (sessionRestored && !accessToken) {
    return <Redirect href="/signup" />;
  }

  if (!sessionRestored) {
    return (
      <View style={{ flex: 1, backgroundColor: '#131313', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#dfb7ff" />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return <WebSettings />;
  }

  return <MobileProfileScreen />;
}

function MobileProfileScreen() {
  const resetAppState = useAppStore((state) => state.resetAppState);
  const user = useAppStore((state) => state.user);
  const accessToken = useAppStore((state) => state.accessToken);
  const refreshToken = useAppStore((state) => state.refreshToken);
  const setAuth = useAppStore((state) => state.setAuth);

  // App preferences state
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);

  useEffect(() => {
    if (accessToken) {
      notificationsApi.getPreferences()
        .then((prefs) => setNotifications(prefs.daily_mastery))
        .catch(() => {});
    }
  }, [accessToken]);

  const handleToggleNotifications = async (val: boolean) => {
    setNotifications(val);
    try {
      await notificationsApi.updatePreferences({ daily_mastery: val, reminders: val });
    } catch {
      // Best-effort setting sync
    }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [proModalVisible, setProModalVisible] = useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to terminate your current Socratic learning workspace session?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Out', 
          style: 'destructive',
          onPress: () => resetAppState() 
        }
      ]
    );
  };

  const handleEditProfile = () => {
    setEditName(user?.name || '');
    setIsEditing(true);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty.');
      return;
    }
    try {
      setSaving(true);
      const updated = await profileApi.update(editName.trim());
      if (accessToken && user) {
        setAuth(accessToken, refreshToken, {
          ...user,
          name: updated.name,
          email: updated.email,
          avatar_url: updated.avatar_url,
          subscription: updated.subscription
        });
      }
      setIsEditing(false);
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err, 'We couldn\'t update your profile. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setUploadingAvatar(true);
        const updated = await profileApi.uploadAvatar(
          asset.uri,
          asset.name || 'avatar.jpg',
          asset.mimeType || 'image/jpeg'
        );

        if (accessToken && user) {
          setAuth(accessToken, refreshToken, {
            ...user,
            avatar_url: updated.avatar_url,
          });
        }
        Alert.alert('Success', 'Profile photo updated successfully.');
      }
    } catch (err) {
      Alert.alert('Error', apiErrorMessage(err, 'Failed to update profile photo.'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'Initiate';
  const displayEmail = user?.email || 'dev@lumina.ai';
  const avatarUrl = user?.avatar_url || user?.avatarUrl;
  const userInitials = (displayName || 'L').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarInitials}>{userInitials}</Text>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color="#dfb7ff" />
                </View>
              )}
            </View>
          </TouchableOpacity>

          {isEditing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 8 }}>
              <TextInput
                style={[styles.profileName, { borderWidth: 1, borderColor: '#dfb7ff', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2, minWidth: 150 }]}
                value={editName}
                onChangeText={setEditName}
                autoFocus
              />
              <TouchableOpacity onPress={handleSaveName} disabled={saving}>
                <Ionicons name="checkmark-circle-outline" size={24} color="#408175" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsEditing(false)}>
                <Ionicons name="close-circle-outline" size={24} color="#ffb4ab" />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.profileName}>{displayName}</Text>
          )}
          <Text style={styles.profileEmail}>{displayEmail}</Text>

          <View style={styles.headerBtnRow}>
            {!isEditing && (
              <TouchableOpacity 
                style={styles.editButton} 
                onPress={handleEditProfile}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={14} color="#dfb7ff" />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.proBadgeBtn}
              onPress={() => setProModalVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="sparkles" size={14} color="#131313" />
              <Text style={styles.proBadgeText}>{(user?.subscription || 'Free').toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Group: Preferences */}
        <Text style={styles.groupTitle}>Preferences</Text>
        <View style={styles.settingsGroup}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(153, 27, 247, 0.1)' }]}>
                <Ionicons name="notifications-outline" size={18} color="#dfb7ff" />
              </View>
              <Text style={styles.settingLabel}>Notifications</Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#1b1d26', true: '#991bf7' }}
              thumbColor={notifications ? '#dfb7ff' : '#6e748a'}
            />
          </View>

          <View style={[styles.settingRow, styles.rowBorder]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(153, 27, 247, 0.1)' }]}>
                <Ionicons name="moon-outline" size={18} color="#dfb7ff" />
              </View>
              <Text style={styles.settingLabel}>Dark Mode</Text>
            </View>
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: '#1b1d26', true: '#991bf7' }}
              thumbColor={darkMode ? '#dfb7ff' : '#6e748a'}
            />
          </View>

          <View style={[styles.settingRow, styles.rowBorder]}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(153, 27, 247, 0.1)' }]}>
                <Ionicons name="finger-print-outline" size={18} color="#dfb7ff" />
              </View>
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
            </View>
            <Switch
              value={hapticFeedback}
              onValueChange={setHapticFeedback}
              trackColor={{ false: '#1b1d26', true: '#991bf7' }}
              thumbColor={hapticFeedback ? '#dfb7ff' : '#6e748a'}
            />
          </View>
        </View>

        {/* Settings Group: Support */}
        <Text style={styles.groupTitle}>Support</Text>
        <View style={styles.settingsGroup}>
          <TouchableOpacity 
            style={styles.settingRowTouch} 
            onPress={() => Alert.alert('Help Center', 'Access documentation at https://docs.lumina.ai')}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 255, 255, 0.03)' }]}>
                <Ionicons name="help-circle-outline" size={18} color="#b8bdd4" />
              </View>
              <Text style={styles.settingLabel}>Help Center</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#6e748a" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.settingRowTouch, styles.rowBorder]} 
            onPress={() => Alert.alert('Contact Support', 'Submit a request to support@lumina.ai')}
            activeOpacity={0.7}
          >
            <View style={styles.settingLeft}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 255, 255, 0.03)' }]}>
                <Ionicons name="mail-outline" size={18} color="#b8bdd4" />
              </View>
              <Text style={styles.settingLabel}>Contact Support</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#6e748a" />
          </TouchableOpacity>
        </View>

        {/* Settings Group: Actions */}
        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={styles.logoutButton} 
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color="#ffb4ab" />
            <Text style={styles.logoutButtonText}>Log Out Workspace</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ProUpgradeModal
        visible={proModalVisible}
        onClose={() => setProModalVisible(false)}
      />
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
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 20,
  },
  avatarWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(153, 27, 247, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(223, 183, 255, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
  avatarOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f0f2f8',
  },
  profileEmail: {
    fontSize: 13,
    color: '#6e748a',
    marginTop: 4,
  },
  headerBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(153, 27, 247, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.2)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  editButtonText: {
    fontSize: 12,
    color: '#dfb7ff',
    fontWeight: '600',
  },
  proBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dfb7ff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  proBadgeText: {
    fontSize: 12,
    color: '#131313',
    fontWeight: '800',
  },
  groupTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6e748a',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  settingsGroup: {
    backgroundColor: 'rgba(20, 20, 20, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.1)',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingRowTouch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(154, 140, 160, 0.08)',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 14,
    color: '#e2e2e2',
    fontWeight: '500',
  },
  actionContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    backgroundColor: 'rgba(255, 180, 171, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.25)',
    borderRadius: 16,
  },
  logoutButtonText: {
    color: '#ffb4ab',
    fontSize: 14,
    fontWeight: '600',
  },
});
