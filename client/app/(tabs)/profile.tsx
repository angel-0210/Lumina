import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Switch,
  Alert,
  Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';

export default function ProfileScreen() {
  const resetAppState = useAppStore((state) => state.resetAppState);
  
  // App preferences state
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);

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
    Alert.alert('Edit Profile', 'Profile modifications are currently controlled by your workspace identity manager.');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarWrapper}>
            <Ionicons name="person" size={48} color="#dfb7ff" />
          </View>
          <Text style={styles.profileName}>Alex Johnson</Text>
          <Text style={styles.profileEmail}>alex.johnson@lumina.ai</Text>
          
          <TouchableOpacity 
            style={styles.editButton} 
            onPress={handleEditProfile}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={16} color="#dfb7ff" />
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
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
              onValueChange={setNotifications}
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
    paddingBottom: 100, // account for floating bottom tab
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
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(153, 27, 247, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
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
    marginTop: 16,
  },
  editButtonText: {
    fontSize: 12,
    color: '#dfb7ff',
    fontWeight: '600',
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
