import { useEffect } from 'react';
import { notificationService } from '@/src/utils/core/notificationService';
import logger from '@/src/utils/core/logger';

/**
 * Hook to initialize notification service and load user preferences
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Setup notification listeners
        notificationService.setupListeners();
        
        // Register push token
        await notificationService.registerPushToken();
        
        // Load and apply saved preferences
        const preferences = await notificationService.loadPreferences();
        if (preferences.enabled && preferences.frequency !== 'never') {
          await notificationService.scheduleNotifications(preferences);
        }
        
        // Sync preferences to database
        await notificationService.syncPreferencesToDatabase();
        
        logger.debug('Notifications initialized with preferences:', preferences);
      } catch (error) {
        logger.error('Error initializing notifications:', error);
      }
    };

    initializeNotifications();

    // Cleanup on unmount
    return () => {
      notificationService.cleanup();
    };
  }, []);
};
