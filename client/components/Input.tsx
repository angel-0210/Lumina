import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  TextInput, 
  View, 
  TouchableOpacity, 
  TextInputProps 
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

const IconPerson = () => (
  <View style={styles.iconContainer}>
    <Ionicons name="person-outline" size={20} color="#d1c1d7" />
  </View>
);

const IconMail = () => (
  <View style={styles.iconContainer}>
    <Ionicons name="mail-outline" size={20} color="#d1c1d7" />
  </View>
);

const IconKey = () => (
  <View style={styles.iconContainer}>
    <Ionicons name="key-outline" size={20} color="#d1c1d7" />
  </View>
);

const IconEye = ({ visible }: { visible: boolean }) => (
  <View style={styles.eyeIconContainer}>
    <Ionicons name={visible ? "eye-outline" : "eye-off-outline"} size={20} color="#d1c1d7" />
  </View>
);

interface InputProps extends TextInputProps {
  label: string;
  iconName?: 'person' | 'mail' | 'key';
  error?: string;
}

export default function Input({ 
  label, 
  iconName, 
  secureTextEntry, 
  error, 
  style, 
  ...props 
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const renderIcon = () => {
    switch (iconName) {
      case 'person':
        return <IconPerson />;
      case 'mail':
        return <IconMail />;
      case 'key':
        return <IconKey />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View 
        style={[
          styles.inputWrapper,
          isFocused && styles.inputWrapperFocused,
          error ? styles.inputWrapperError : null
        ]}
      >
        {renderIcon()}
        
        <TextInput
          style={[styles.textInput, style]}
          placeholderTextColor="rgba(209, 193, 215, 0.4)"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          autoCapitalize="none"
          {...props}
        />

        {secureTextEntry && (
          <TouchableOpacity 
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
            style={styles.eyeButton}
            activeOpacity={0.7}
          >
            <IconEye visible={isPasswordVisible} />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e2e2e2',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 14, 14, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(78, 67, 84, 0.5)',
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
  },
  inputWrapperFocused: {
    borderColor: '#9929ea',
  },
  inputWrapperError: {
    borderColor: '#ffb4ab',
  },
  iconContainer: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
    width: 20,
    height: 20,
  },
  eyeIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 20,
    height: 20,
  },
  iconChar: {
    fontSize: 16,
    color: '#d1c1d7',
  },
  textInput: {
    flex: 1,
    height: '100%',
    color: '#e2e2e2',
    fontSize: 14,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 12,
    marginTop: 4,
  },
});
