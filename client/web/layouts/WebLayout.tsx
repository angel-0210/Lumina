import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store';
import { searchApi, SearchResponse } from '../../services/api';
import UploadModal from '../../components/UploadModal';
import ProUpgradeModal from '../../components/ProUpgradeModal';

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
  const [hasRedirected, setHasRedirected] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal states
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [proModalVisible, setProModalVisible] = useState(false);

  // Wait for session restoration before redirecting.
  useEffect(() => {
    if (sessionRestored && !accessToken && !hasRedirected) {
      setHasRedirected(true);
      router.replace('/login');
    }
  }, [sessionRestored, accessToken, hasRedirected]);

  // Debounced search logic
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearchLoading(false);
      setShowSearchDropdown(false);
      return;
    }

    setSearchLoading(true);
    setShowSearchDropdown(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await searchApi.query(searchQuery.trim());
        setSearchResults(res);
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  if (!sessionRestored) {
    return (
      <View style={{ flex: 1, backgroundColor: '#131313', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' as any }}>
        <ActivityIndicator size="large" color="#dfb7ff" />
        <Text style={{ color: '#d1c1d7', marginTop: 12, fontSize: 13 }}>Restoring session...</Text>
      </View>
    );
  }

  if (!accessToken) {
    return (
      <View style={{ flex: 1, backgroundColor: '#131313', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' as any }}>
        <ActivityIndicator size="large" color="#dfb7ff" />
        <Text style={{ color: '#d1c1d7', marginTop: 12, fontSize: 13 }}>Redirecting to login...</Text>
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

  const displayName = user?.name || user?.email?.split('@')[0] || 'Learner';
  const userInitials = (displayName || 'L').slice(0, 2).toUpperCase();
  const avatarUrl = user?.avatar_url || user?.avatarUrl;
  const isPro = user?.subscription?.toLowerCase() === 'pro' || user?.subscription?.toLowerCase() === 'enterprise';

  const isRouteActive = (path: string) => {
    if (path === '/') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(path);
  };

  return (
    <View style={styles.container}>
      <style>{`
        @keyframes shimmer { 100% { left: 200%; } }
        body { font-family: 'Inter', sans-serif !important; background-color: #131313 !important; margin: 0; padding: 0; }
        html { margin: 0; padding: 0; background-color: #131313 !important; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #131313; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #393939; }
      `}</style>

      {/* Web Sidebar */}
      <View style={styles.sidebar}>
        <View style={styles.logoContainer}>
          <Ionicons name="school" size={28} color="#dfb7ff" />
          <Text style={styles.logoText}>Lumina</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>LEARNING JOURNEY</Text>
        </View>

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
                  !active && hovered && styles.navItemHovered,
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
        <TouchableOpacity
          style={styles.sidebarFooter}
          onPress={() => router.push('/settings')}
          activeOpacity={0.8}
        >
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image alt="User Profile" style={styles.avatar} source={{ uri: avatarUrl }} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{userInitials}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.profileTier} numberOfLines={1}>
              {(user?.subscription || 'Free').toUpperCase()} TIER
            </Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#6e748a" />
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Header toolbar */}
        <View style={styles.header}>
          <View style={styles.searchWrapper}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={16} color="#6e748a" />
              <TextInput
                style={styles.searchInput as any}
                placeholder="Search concepts, documents..."
                placeholderTextColor="#6e748a"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => searchQuery.trim() && setShowSearchDropdown(true)}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#6e748a" />
                </TouchableOpacity>
              )}
            </View>

            {/* Live Search Dropdown */}
            {showSearchDropdown && (
              <View style={styles.searchDropdown}>
                {searchLoading ? (
                  <View style={styles.dropdownLoading}>
                    <ActivityIndicator size="small" color="#dfb7ff" />
                    <Text style={styles.dropdownLoadingText}>Searching Lumina knowledge base...</Text>
                  </View>
                ) : searchResults && searchResults.total_matches > 0 ? (
                  <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                    {searchResults.documents.length > 0 && (
                      <View style={styles.dropdownSection}>
                        <Text style={styles.dropdownSectionTitle}>DOCUMENTS</Text>
                        {searchResults.documents.map((doc) => (
                          <TouchableOpacity
                            key={doc.id}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setShowSearchDropdown(false);
                              router.push(`/documents/${doc.id}`);
                            }}
                          >
                            <Ionicons name="document-text-outline" size={16} color="#dfb7ff" />
                            <Text style={styles.dropdownItemTitle} numberOfLines={1}>{doc.title}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {searchResults.topics.length > 0 && (
                      <View style={styles.dropdownSection}>
                        <Text style={styles.dropdownSectionTitle}>TOPICS</Text>
                        {searchResults.topics.map((top) => (
                          <TouchableOpacity
                            key={top.id}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setShowSearchDropdown(false);
                              router.push(`/mastery/${top.id}`);
                            }}
                          >
                            <Ionicons name="school-outline" size={16} color="#dfb7ff" />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.dropdownItemTitle} numberOfLines={1}>{top.title}</Text>
                              <Text style={styles.dropdownItemSub} numberOfLines={1}>{top.document_title}</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {searchResults.chunks.length > 0 && (
                      <View style={styles.dropdownSection}>
                        <Text style={styles.dropdownSectionTitle}>CONTENT MATCHES</Text>
                        {searchResults.chunks.map((chk) => (
                          <TouchableOpacity
                            key={chk.id}
                            style={styles.dropdownItem}
                            onPress={() => {
                              setShowSearchDropdown(false);
                              router.push(`/documents/${chk.document_id}`);
                            }}
                          >
                            <Ionicons name="text-outline" size={16} color="#a0a5c0" />
                            <Text style={styles.dropdownItemSub} numberOfLines={2}>{chk.content}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </ScrollView>
                ) : (
                  <View style={styles.dropdownEmpty}>
                    <Text style={styles.dropdownEmptyText}>No matching documents or topics found.</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.toolbarActions}>
            {!isPro && (
              <TouchableOpacity
                style={styles.proButton}
                onPress={() => setProModalVisible(true)}
              >
                <Ionicons name="sparkles" size={14} color="#dfb7ff" />
                <Text style={styles.proButtonText}>Upgrade to Pro</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => setUploadModalVisible(true)}
            >
              <Ionicons name="cloud-upload" size={16} color="#dfb7ff" />
              <Text style={styles.uploadButtonText}>Upload Material</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Page Content */}
        <View style={styles.pageBody}>{children}</View>
      </View>

      {/* Global Modals */}
      <UploadModal
        visible={uploadModalVisible}
        onClose={() => setUploadModalVisible(false)}
        onSuccess={() => {
          setUploadModalVisible(false);
          router.push('/documents');
        }}
      />
      <ProUpgradeModal
        visible={proModalVisible}
        onClose={() => setProModalVisible(false)}
      />
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
  avatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#991bf7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
  searchWrapper: {
    position: 'relative',
    zIndex: 100,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    width: 360,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: '#f0f2f8',
    fontSize: 13,
    outlineStyle: 'none',
  },
  searchDropdown: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.15)',
    borderRadius: 14,
    maxHeight: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    overflow: 'hidden',
    zIndex: 200,
  },
  dropdownLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  dropdownLoadingText: {
    color: '#6e748a',
    fontSize: 13,
  },
  dropdownScroll: {
    padding: 12,
  },
  dropdownSection: {
    marginBottom: 12,
  },
  dropdownSectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginLeft: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 10,
    marginBottom: 2,
    cursor: 'pointer' as any,
  },
  dropdownItemTitle: {
    color: '#f0f2f8',
    fontSize: 13,
    fontWeight: '600',
  },
  dropdownItemSub: {
    color: '#6e748a',
    fontSize: 11,
    marginTop: 2,
  },
  dropdownEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    color: '#6e748a',
    fontSize: 13,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  proButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(223, 183, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(223, 183, 255, 0.25)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
    cursor: 'pointer' as any,
  },
  proButtonText: {
    color: '#dfb7ff',
    fontSize: 13,
    fontWeight: '700',
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
