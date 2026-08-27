import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../../store';
import { authApi, apiErrorMessage } from '../../../services/api';

export default function WebLogin() {
  const setAuth = useAppStore((state) => state.setAuth);
  const accessToken = useAppStore((state) => state.accessToken);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  // Errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (accessToken) {
      router.replace('/');
    }
  }, [accessToken]);

  const handleLogin = async () => {
    setEmailError('');
    setPasswordError('');
    setGeneralError(null);

    let isValid = true;
    if (!email.trim()) {
      setEmailError('Email is required.');
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Enter a valid email address.');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required.');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      isValid = false;
    }

    if (!isValid) return;

    try {
      setLoading(true);
      const session = await authApi.login(email.trim().toLowerCase(), password);
      setAuth(session.access_token, session.refresh_token ?? null, session.user);
      router.replace('/');
    } catch (err) {
      setGeneralError(apiErrorMessage(err, 'Authentication failed. Please verify your email and password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <style>{`
        body {
          background-color: #131313 !important;
          font-family: 'Inter', sans-serif !important;
          margin: 0;
          padding: 0;
        }
        html {
          margin: 0;
          padding: 0;
          background-color: #131313 !important;
        }
        #root {
          background-color: #131313 !important;
        }
      `}</style>
      
      <View style={styles.cardWrapper}>
        {/* Header Branding */}
        <View style={styles.logoRow}>
          <Ionicons name="school" size={32} color="#dfb7ff" />
          <Text style={styles.logoText}>Lumina</Text>
        </View>
        <Text style={styles.subtitle}>Welcome back. Re-authenticate to access your workspace.</Text>

        {/* General Error Banner */}
        {generalError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#ffb4ab" />
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        )}

        {/* Glassmorphic card */}
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={[styles.input, emailError && styles.inputError]}
              placeholder="evelyn@lumina.ai"
              placeholderTextColor="#6e748a"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, passwordError && styles.inputError]}
              placeholder="••••••••••••"
              placeholderTextColor="#6e748a"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />
            {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
          </View>

          {/* Remember Me and Forgot Password */}
          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                {rememberMe && <Ionicons name="checkmark" size={12} color="#131313" />}
              </View>
              <Text style={styles.checkboxLabel}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => alert('Dispatched password reset link to your email.')}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            disabled={loading}
            onPress={handleLogin}
          >
            {loading ? (
              <ActivityIndicator color="#131313" size="small" />
            ) : (
              <>
                <Text style={styles.submitBtnText}>Authenticate</Text>
                <Ionicons name="arrow-forward" size={16} color="#131313" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer signup shortcut */}
        <TouchableOpacity style={styles.footerLink} onPress={() => router.push('/signup')}>
          <Text style={styles.footerLinkText}>New initiate? Create workspace here</Text>
          <Ionicons name="arrow-forward" size={14} color="#d1c1d7" style={styles.footerLinkIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#131313',
    minHeight: '100vh' as any,
    padding: 24,
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#dfb7ff',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#6e748a',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  errorBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 180, 171, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 180, 171, 0.25)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  errorBannerText: {
    color: '#ffb4ab',
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
  },
  card: {
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.08)',
    borderRadius: 16,
    padding: 32,
    width: '100%',
  },
  field: {
    marginBottom: 16,
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
  inputError: {
    borderColor: 'rgba(255, 180, 171, 0.4)',
  },
  fieldError: {
    fontSize: 11,
    color: '#ffb4ab',
    marginTop: 6,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: 'rgba(245, 248, 255, 0.1)',
    backgroundColor: '#131313',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#dfb7ff',
    borderColor: '#dfb7ff',
  },
  checkboxLabel: {
    fontSize: 13,
    color: '#6e748a',
  },
  forgotText: {
    fontSize: 13,
    color: '#dfb7ff',
    textDecorationLine: 'underline',
  },
  submitBtn: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer' as any,
  },
  submitBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed' as any,
  },
  submitBtnText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '700',
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    cursor: 'pointer' as any,
  },
  footerLinkText: {
    color: '#6e748a',
    fontSize: 13,
    fontWeight: '500',
  },
  footerLinkIcon: {
    marginTop: 1,
  },
});
