import React from 'react';
import { 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  TouchableOpacityProps, 
  View,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const IconArrowForward = () => (
  <View style={styles.iconContainer}>
    <Ionicons name="arrow-forward" size={18} color="#ffffff" />
  </View>
);

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  showArrow?: boolean;
}

export default function Button({ 
  title, 
  loading, 
  showArrow = false, 
  disabled, 
  style, 
  ...props 
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isDisabled && styles.buttonDisabled,
        style
      ]}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <View style={styles.contentContainer}>
          <Text style={styles.buttonText}>{title}</Text>
          {showArrow ? <IconArrowForward /> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#991bf7',
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 10px rgba(153, 27, 247, 0.3)',
      },
      default: {
        shadowColor: '#991bf7',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
    }),
    elevation: 4,
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: 'rgba(153, 41, 247, 0.4)',
    shadowOpacity: 0,
    elevation: 0,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  iconContainer: {
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconChar: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
