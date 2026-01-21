import React, { Component, ReactNode } from 'react';
import { PostHogProvider } from 'posthog-react-native';
import logger from '@/src/utils/core/logger';

interface Props {
  apiKey: string;
  options?: any;
  autocapture?: boolean;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Safe wrapper around PostHogProvider that catches initialization errors
 * and prevents app crashes. If PostHog fails to initialize, the app
 * continues to work without analytics.
 */
export class SafePostHogProvider extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Log error but don't crash the app
    logger.error('[PostHog] Failed to initialize:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error for debugging
    logger.error('[PostHog] Provider error:', error, errorInfo);
  }

  render() {
    // If PostHog failed to initialize, render children without PostHog
    if (this.state.hasError) {
      logger.warn('[PostHog] Running without analytics due to initialization error');
      return <>{this.props.children}</>;
    }

    try {
      return (
        <PostHogProvider
          apiKey={this.props.apiKey}
          options={{
            ...this.props.options,
            // Add additional safety options
            flushAt: 20,
            flushInterval: 10000,
            // Disable features that might cause native crashes
            captureApplicationLifecycleEvents: false,
            captureDeepLinks: false,
          }}
          autocapture={this.props.autocapture}
        >
          {this.props.children}
        </PostHogProvider>
      );
    } catch (error) {
      // Catch synchronous errors during render
      logger.error('[PostHog] Render error:', error);
      return <>{this.props.children}</>;
    }
  }
}
