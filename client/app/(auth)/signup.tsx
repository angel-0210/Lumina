import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  Alert
} from 'react-native';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAppStore } from '../../store';
import { authApi, apiErrorMessage, parseOAuthTokens } from '../../services/api';
import Input from '../../components/Input';
import Button from '../../components/Button';
import WebSignup from '../../web/pages/Login/Signup';

WebBrowser.maybeCompleteAuthSession();

export default function SignupScreen() {
  if (Platform.OS === 'web') {
    return <WebSignup />;
  }
  return <MobileSignupScreen />;
}

function MobileSignupScreen() {
  const setAuth = useAppStore((state) => state.setAuth);
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  // Validation error states
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

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

  // Password strength calculation
  const getPasswordStrength = () => {
    let score = 0;
    if (password.length === 0) return { score: 0, text: 'Awaiting input', color: '#6e748a' };
    
    if (password.length > 0) score += 1;
    if (password.length > 5) score += 1;
    if (password.length > 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)) score += 1;
    if (password.length > 12 && /[^A-Za-z0-9]/.test(password)) score += 1;

    switch (score) {
      case 1:
        return { score: 1, text: 'Weak', color: '#ffb4ab' };
      case 2:
        return { score: 2, text: 'Fair', color: '#d6c873' };
      case 3:
        return { score: 3, text: 'Strong', color: '#dfb7ff' };
      case 4:
      default:
        return { score: 4, text: 'Optimal', color: '#9929ea' };
    }
  };

  const strength = getPasswordStrength();

  const handleRegister = async () => {
    // Reset errors
    setNameError('');
    setEmailError('');
    setPasswordError('');

    let isValid = true;

    if (!fullName.trim()) {
      setNameError('Full Name is required');
      isValid = false;
    }
    
    if (!email.trim()) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Enter a valid email address');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Access Key (Password) is required');
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      isValid = false;
    }

    if (!agreeTerms) {
      Alert.alert('Terms and Conditions', 'You must agree to the Terms of Service and Privacy Policy to register.');
      isValid = false;
    }

    if (!isValid) return;

    setLoading(true);

    try {
      const session = await authApi.signup(fullName.trim(), email.trim().toLowerCase(), password);
      if (session.requires_verification) {
        Alert.alert(
          'Verification Required',
          session.message || 'Account created! Please verify your email before logging in.',
          [{ text: 'Proceed to Login', onPress: () => router.replace('/login') }]
        );
        return;
      }
      setAuth(session.access_token, session.refresh_token ?? null, session.user);
      router.replace('/');
    } catch (err) {
      const msg = apiErrorMessage(err, 'An error occurred during account creation.');
      Alert.alert('Registration Failed', msg);
    } finally {
      setLoading(false);
    }
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
              <Text style={styles.subtitle}>Initialize your deep learning environment.</Text>
            </View>

            {/* Registration Glass Card */}
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
                label="Full Name"
                iconName="person"
                placeholder="Dr. Evelyn Vance"
                value={fullName}
                onChangeText={setFullName}
                error={nameError}
              />

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

              {/* Password Strength Indicator */}
              <View style={styles.strengthContainer}>
                <View style={styles.barsContainer}>
                  {[1, 2, 3, 4].map((barIdx) => (
                    <View 
                      key={barIdx}
                      style={[
                        styles.strengthBar,
                        strength.score >= barIdx ? { backgroundColor: strength.color } : styles.strengthBarEmpty
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthText, { color: strength.color }]}>
                  {strength.text}
                </Text>
              </View>

              {/* Terms Checkbox */}
              <TouchableOpacity 
                style={styles.checkboxContainer}
                onPress={() => setAgreeTerms(!agreeTerms)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, agreeTerms ? styles.checkboxChecked : null]}>
                  {agreeTerms ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
                </View>
                <Text style={styles.checkboxLabel}>
                  I agree to the <Text style={styles.link}>Terms of Service</Text> and <Text style={styles.link}>Privacy Policy</Text>.
                </Text>
              </TouchableOpacity>

              <Button
                title="Create My Workspace"
                onPress={handleRegister}
                loading={loading}
                showArrow
              />
            </View>

            {/* Footer Link */}
            <TouchableOpacity 
              style={styles.footerLink}
              onPress={() => router.push('/login')}
              activeOpacity={0.7}
            >
              <Text style={styles.footerText}>Already an initiate? Authenticate here</Text>
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
  strengthContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 20,
    width: '100%',
  },
  barsContainer: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
    marginRight: 12,
    height: 6,
  },
  strengthBar: {
    flex: 1,
    height: '100%',
    borderRadius: 3,
  },
  strengthBarEmpty: {
    backgroundColor: '#353535',
  },
  strengthText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    width: '100%',
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
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#991bf7',
    borderColor: '#991bf7',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    color: '#d1c1d7',
    lineHeight: 18,
  },
  link: {
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
