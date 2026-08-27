import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';

interface WebLayoutProps {
  children: React.ReactNode;
}

export default function WebLayout({ children }: WebLayoutProps) {
  const pathname = usePathname();
  const user = useAppStore((state) => state.user);
  const accessToken = useAppStore((state) => state.accessToken);
  const sessionRestored = useAppStore((state) => state.sessionRestored);
  const clearAuth = useAppStore((state) => state.clearAuth);
  
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  // Wait for session restoration before redirecting.
  // This ensures the auth state is fully initialized before making any authenticated API calls.
  useEffect(() => {
    if (sessionRestored && !accessToken) {
      router.replace('/login');
    }
  }, [sessionRestored, accessToken]);

  // If session is not yet restored, show loading.
  // Do NOT redirect until we know if there's a valid persisted session.
  if (!sessionRestored) {
    return (
      <View style={{ flex: 1, backgroundColor: '#131313', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' as any }}>
        <ActivityIndicator size="large" color="#dfb7ff" />
      </View>
    );
  }

  // If session is restored but no access token, redirect to login.
  if (!accessToken) {
    return (
      <View style={{ flex: 1, backgroundColor: '#131313', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' as any }}>
        <ActivityIndicator size="large" color="#dfb7ff" />
      </View>
    );
  }
  
  const navItems = [
    { label: 'Home', path: '/', icon: 'home-outline', iconActive: 'home' },
    { label: 'Library', path: '/documents', icon: 'document-text-outline', iconActive: 'document-text' },
    { label: 'Learn', path: '/learn', icon: 'school-outline', iconActive: 'school' },
    { label: 'Crucible', path: '/crucible', icon: 'flame-outline', iconActive: 'flame' },
    { label: 'Analytics', path: '/analytics', icon: 'analytics-outline', iconActive: 'analytics' },
    { label: 'Settings', path: '/settings', icon: 'settings-outline', iconActive: 'settings' },
  ];

  const handleLogout = () => {
    clearAuth();
    router.replace('/login');
  };

  const displayName = user?.name || user?.email?.split('@')[0] || 'Alex';

  // Helper to determine if a route is active
  const isRouteActive = (path: string) => {
    if (path === '/') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(path);
  };

  return (
    <View style={styles.container}>
      {/* Inject custom global CSS styles for animations and scrollbars */}
      <style>{`
        @keyframes shimmer {
          100% { left: 200%; }
        }
        .ai-shimmer-bg {
          position: relative;
          overflow: hidden;
        }
        .ai-shimmer-bg::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 50%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(181, 185, 240, 0.8), transparent);
          animation: shimmer 2.5s infinite;
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(181, 185, 240, 0.2), 0 0 15px rgba(181, 185, 240, 0.05); }
          50% { box-shadow: 0 0 0 1px rgba(181, 185, 240, 0.5), 0 0 25px rgba(181, 185, 240, 0.15); }
        }
        .ai-pulse-glow {
          box-shadow: 0 0 0 1px rgba(181, 185, 240, 0.3);
          animation: pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        body {
          font-family: 'Inter', sans-serif !important;
          background-color: #131313 !important;
          margin: 0;
          padding: 0;
        }
        html {
          margin: 0;
          padding: 0;
          background-color: #131313 !important;
        }
        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #131313;
        }
        ::-webkit-scrollbar-thumb {
          background: #2a2a2a;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #393939;
        }
      `}</style>

      {/* Font link injection */}
      {Platform.OS === 'web' && (
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      )}

      {/* Web Sidebar */}
      <View style={styles.sidebar}>
        {/* Brand Logo */}
        <View style={styles.logoContainer}>
          <Ionicons name="school" size={28} color="#dfb7ff" />
          <Text style={styles.logoText}>Lumina</Text>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>LEARNING JOURNEY</Text>
        </View>

        {/* Nav list */}
        <ScrollView style={styles.navList} showsVerticalScrollIndicator={false}>
          {navItems.map((item) => {
            const active = isRouteActive(item.path);
            const hovered = hoveredTab === item.path;
            const Touchable = TouchableOpacity as any;
            return (
              <Touchable
                key={item.path}
                onPress={() => router.push(item.path as any)}
                onMouseEnter={() => setHoveredTab(item.path)}
                onMouseLeave={() => setHoveredTab(null)}
                style={[
                  styles.navItem,
                  active && styles.navItemActive,
                  !active && hovered && styles.navItemHovered
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={(active ? item.iconActive : item.icon) as any}
                  size={20}
                  color={active ? '#dfb7ff' : '#d1c1d7'}
                  style={styles.navIcon}
                />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {item.label}
                </Text>
                {active && <View style={styles.activeIndicator} />}
              </Touchable>
            );
          })}
        </ScrollView>

        {/* User profile footer */}
        <View style={styles.sidebarFooter}>
          <View style={styles.avatarWrapper}>
            <Image
              alt="User Profile"
              style={styles.avatar}
              source={{
                uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBDxa40j0z6GPE7nCE64XEd7kjP7PkWAU5YhKwv7VsdjEfvwxAq-cwUCJYxzG06F0vN3xz-KbwAYpEcZS-nyRChjbMpiwdEkEvajBcLob_f2O4NCh6YpeLTL-ihXkrW5g1jcUTrj_-C-canA3gXzvEbTYm09GrFiNmq6eBYDbHDX3drX0KnKhwd3jIvcDoBf__kd20Abzi54YYEJoGhfuiX4vI6evQdadVydf8b3Vs40pSw-kz_TSPk',
              }}
            />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.profileTier} numberOfLines={1}>
              {(user?.subscription || 'Free').toUpperCase()} TIER
            </Text>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color="#6e748a" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Header toolbar */}
        <View style={styles.header}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#6e748a" />
            <Text style={styles.searchText}>Search concepts, documents...</Text>
          </View>
          <View style={styles.toolbarActions}>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => router.push('/documents')}
            >
              <Ionicons name="cloud-upload" size={16} color="#dfb7ff" />
              <Text style={styles.uploadButtonText}>Upload Material</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Page Content */}
        <View style={styles.pageBody}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#131313',
    minHeight: '100vh' as any,
  },
  sidebar: {
    width: 256,
    backgroundColor: '#1f1f1f',
    borderRightWidth: 1,
    borderRightColor: 'rgba(245, 248, 255, 0.1)',
    height: '100vh' as any,
    position: 'fixed' as any,
    left: 0,
    top: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    paddingVertical: 24,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 32,
    gap: 12,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#dfb7ff',
    letterSpacing: -0.5,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionHeaderText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#d1c1d7',
    opacity: 0.6,
    letterSpacing: 1.5,
  },
  navList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: '#2a2a2a',
  },
  navItemHovered: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  navIcon: {
    marginRight: 12,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#d1c1d7',
  },
  navLabelActive: {
    color: '#dfb7ff',
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    right: 0,
    top: 12,
    bottom: 12,
    width: 3,
    backgroundColor: '#dfb7ff',
    borderRadius: 1.5,
  },
  sidebarFooter: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 248, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 248, 255, 0.1)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e2e2',
  },
  profileTier: {
    fontSize: 9,
    fontWeight: '700',
    color: '#dfb7ff',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  logoutButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainContent: {
    flex: 1,
    marginLeft: 256,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh' as any,
  },
  header: {
    height: 70,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 248, 255, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    backgroundColor: '#131313',
    position: 'sticky' as any,
    top: 0,
    zIndex: 90,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.06)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: 320,
    gap: 8,
  },
  searchText: {
    color: '#6e748a',
    fontSize: 13,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(153, 27, 247, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(153, 27, 247, 0.25)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
    cursor: 'pointer' as any,
  },
  uploadButtonText: {
    color: '#dfb7ff',
    fontSize: 13,
    fontWeight: '600',
  },
  pageBody: {
    flex: 1,
    paddingHorizontal: 40,
    paddingVertical: 32,
    backgroundColor: '#131313',
    overflow: 'auto',
  },
});
