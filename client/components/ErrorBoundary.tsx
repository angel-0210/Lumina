import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error);
    console.error('Error Info:', errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: '#131313',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
          }}
        >
          <Ionicons name="alert-circle" size={48} color="#ffb4ab" style={{ marginBottom: 16 }} />
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#e2e2e2',
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            Oops! Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: '#d1c1d7',
              marginBottom: 24,
              textAlign: 'center',
              lineHeight: 20,
              marginHorizontal: 8,
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
          </Text>
          <TouchableOpacity
            onPress={this.handleReset}
            style={{
              backgroundColor: '#dfb7ff',
              paddingVertical: 12,
              paddingHorizontal: 32,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: '#131313',
                fontWeight: '700',
                fontSize: 14,
              }}
            >
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

