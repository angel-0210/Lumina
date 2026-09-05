import React, { useState } from 'react';
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

export default function WebSignup() {
  const setAuth = useAppStore((state) => state.setAuth);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const [verificationSent, setVerificationSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  // Validation errors
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState<string | null>(null);

  const fillTestCredentials = () => {
    const timestamp = Date.now().toString().slice(-5);
    setFullName('Test Scholar');
    setEmail(`test.learner.${timestamp}@lumina.ai`);
    setPassword('LuminaTest123!');
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setGeneralError(null);
  };

  const handleSignup = async () => {
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setGeneralError(null);

    let isValid = true;
    if (!fullName.trim()) {
      setNameError('Full name is required.');
      isValid = false;
    }

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
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      isValid = false;
    }

    if (!isValid) return;

    try {
      setLoading(true);
      const session = await authApi.signup(fullName.trim(), email.trim().toLowerCase(), password);
      if (session.requires_verification) {
        setRegisteredEmail(email.trim().toLowerCase());
        setVerificationSent(true);
      } else if (session.access_token) {
        setAuth(session.access_token, session.refresh_token ?? null, session.user);
        router.replace('/');
      }
    } catch (err) {
      const msg = apiErrorMessage(err, 'Sign up failed. That email address may already be registered.');
      const lower = msg.toLowerCase();
      if (lower.includes('account created') || lower.includes('confirm your email') || lower.includes('verify your email')) {
        setRegisteredEmail(email.trim().toLowerCase());
        setVerificationSent(true);
      } else {
        setGeneralError(msg);
      }
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
        }
      `}</style>
      
      <View style={styles.cardWrapper}>
        {/* Branding Header */}
        <View style={styles.logoRow}>
          <Ionicons name="school" size={32} color="#dfb7ff" />
          <Text style={styles.logoText}>Lumina</Text>
        </View>

        {verificationSent ? (
          <View style={styles.card}>
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="mail-unread-outline" size={48} color="#dfb7ff" />
            </View>
            <Text style={[styles.logoText, { fontSize: 20, textAlign: 'center', marginBottom: 8 }]}>
              Account Created Successfully!
            </Text>
            <Text style={[styles.subtitle, { marginBottom: 24 }]}>
              We’ve sent a verification link to <Text style={{ color: '#dfb7ff', fontWeight: '600' }}>{registeredEmail}</Text>. Please verify your email before logging in.
            </Text>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={() => router.push('/login')}
            >
              <Text style={styles.submitBtnText}>Proceed to Login</Text>
              <Ionicons name="arrow-forward" size={16} color="#131313" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>Create your scholarly workspace. AI models load immediately.</Text>

            {/* General Error Banner */}
            {generalError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle-outline" size={18} color="#ffb4ab" />
                <Text style={styles.errorBannerText}>{generalError}</Text>
              </View>
            )}

            {/* Card */}
            <View style={styles.card}>
              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={[styles.input, nameError && styles.inputError]}
                  placeholder="Evelyn Initiate"
                  placeholderTextColor="#6e748a"
                  value={fullName}
                  onChangeText={setFullName}
                />
                {nameError && <Text style={styles.fieldError}>{nameError}</Text>}
              </View>

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

              {/* Quick Fill Test Email */}
              <TouchableOpacity
                style={{
                  alignSelf: 'flex-end',
                  marginBottom: 16,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  backgroundColor: 'rgba(223, 183, 255, 0.1)',
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: 'rgba(223, 183, 255, 0.25)',
                }}
                onPress={fillTestCredentials}
              >
                <Text style={{ color: '#dfb7ff', fontSize: 11, fontWeight: '600' }}>
                  ⚡ Fill Test Credentials
                </Text>
              </TouchableOpacity>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                disabled={loading}
                onPress={handleSignup}
              >
                {loading ? (
                  <ActivityIndicator color="#131313" size="small" />
                ) : (
                  <>
                    <Text style={styles.submitBtnText}>Initialize Workspace</Text>
                    <Ionicons name="arrow-forward" size={16} color="#131313" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer login shortcut */}
            <TouchableOpacity style={styles.footerLink} onPress={() => router.push('/login')}>
              <Text style={styles.footerLinkText}>Already registered? Login here</Text>
              <Ionicons name="arrow-forward" size={14} color="#d1c1d7" style={styles.footerLinkIcon} />
            </TouchableOpacity>
          </>
        )}
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
  submitBtn: {
    backgroundColor: '#dfb7ff',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer' as any,
    marginTop: 12,
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
