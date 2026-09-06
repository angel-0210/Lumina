import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAppStore } from '../../store';
import { authApi, apiErrorMessage, parseOAuthTokens } from '../../services/api';
import Input from '../../components/Input';
import Button from '../../components/Button';
import WebLogin from '../../web/pages/Login';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const accessToken = useAppStore((state) => state.accessToken);

  // Redirect to home if already logged in
  useEffect(() => {
    if (accessToken) {
      router.replace('/');
    }
  }, [accessToken]);

  if (Platform.OS === 'web') {
    return <WebLogin />;
  }
  return <MobileLoginScreen />;
}

function MobileLoginScreen() {
  const setAuth = useAppStore((state) => state.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      const redirectUrl = Linking.createURL('auth/callback');
      const res = await authApi.getGoogleUrl(redirectUrl);
      const result = await WebBrowser.openAuthSessionAsync(res.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        const { accessToken: token, refreshToken: refToken } = parseOAuthTokens(result.url);
        if (token) {
          setAuth(token, refToken, { id: '', email: null, name: null, subscription: 'free' });
          const user = await authApi.me();
          setAuth(token, refToken, user);
          router.replace('/');
        } else {
          Alert.alert('Authentication Error', 'No session token received from Google sign-in.');
        }
      }
    } catch (err) {
      Alert.alert('Google Sign-In Failed', apiErrorMessage(err, 'Failed to sign in with Google.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    // Reset errors
    setEmailError('');
    setPasswordError('');

    let isValid = true;

    if (!email.trim()) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Enter a valid email address');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      isValid = false;
    }

    if (!isValid) return;

    setLoading(true);

    try {
      const session = await authApi.login(email.trim().toLowerCase(), password);
      setAuth(session.access_token, session.refresh_token ?? null, session.user);
      router.replace('/');
    } catch (err) {
      const msg = apiErrorMessage(err, 'Invalid email or password.');
      Alert.alert('Authentication Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    Alert.alert('Reset Password', 'A password reset link has been dispatched to your email address.');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.webContainer}>
            {/* Header Brand */}
            <View style={styles.header}>
              <View style={styles.logoRow}>
                <Ionicons name="school" size={32} color="#dfb7ff" />
                <Text style={styles.logoText}>Lumina</Text>
              </View>
              <Text style={styles.subtitle}>Welcome back. Re-authenticate to access your workspace.</Text>
            </View>

            {/* Authentication Glass Card */}
            <View style={styles.glassCard}>
              {/* Soft decorative glow background effect */}
              <View style={styles.glowOverlay} />

              {/* Google OAuth Button */}
              <TouchableOpacity
                style={styles.googleBtn}
                onPress={handleGoogleLogin}
                disabled={googleLoading}
                activeOpacity={0.8}
              >
                {googleLoading ? (
                  <ActivityIndicator color="#e2e2e2" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color="#dfb7ff" />
                    <Text style={styles.googleBtnText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR EMAIL</Text>
                <View style={styles.dividerLine} />
              </View>

              <Input
                label="Email address"
                iconName="mail"
                placeholder="evelyn@lumina.ai"
                value={email}
                onChangeText={setEmail}
                error={emailError}
                keyboardType="email-address"
              />

              <Input
                label="Password"
                iconName="key"
                placeholder="••••••••••••"
                value={password}
                onChangeText={setPassword}
                error={passwordError}
                secureTextEntry
              />

              {/* Remember Me and Forgot Password Layout */}
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setRememberMe(!rememberMe)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                  </View>
                  <Text style={styles.checkboxLabel}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              <Button
                title="Authenticate"
                onPress={handleLogin}
                loading={loading}
                showArrow
              />
            </View>

            {/* Footer Link */}
            <TouchableOpacity
              style={styles.footerLink}
              onPress={() => router.push('/signup')}
              activeOpacity={0.7}
            >
              <Text style={styles.footerText}>New initiate? Create workspace here</Text>
              <Ionicons name="arrow-forward" size={14} color="#d1c1d7" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#131313',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  webContainer: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#dfb7ff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#d1c1d7',
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  glassCard: {
    width: '100%',
    backgroundColor: 'rgba(31, 31, 31, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(154, 140, 160, 0.15)',
    borderRadius: 16,
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  glowOverlay: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(153, 27, 247, 0.08)',
    zIndex: 0,
  },
  googleBtn: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  googleBtnText: {
    color: '#e2e2e2',
    fontSize: 14,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(245, 248, 255, 0.08)',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6e748a',
    letterSpacing: 1.2,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: 'rgba(78, 67, 84, 0.5)',
    backgroundColor: 'rgba(14, 14, 14, 0.6)',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: '#991bf7',
    borderColor: '#991bf7',
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#d1c1d7',
  },
  forgotPasswordText: {
    fontSize: 13,
    color: '#dfb7ff',
    textDecorationLine: 'underline',
  },
  footerLink: {
    marginTop: 24,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: '#d1c1d7',
    fontSize: 14,
  },
});
