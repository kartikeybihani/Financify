import { useEffect } from 'react';
import { notificationService } from '@/src/utils/notificationService';

/**
 * Hook to initialize notification service and load user preferences
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Setup notification listeners
        notificationService.setupListeners();
        
        // Load and apply saved preferences
        const preferences = await notificationService.loadPreferences();
        if (preferences.enabled && preferences.frequency !== 'never') {
          await notificationService.scheduleNotifications(preferences);
        }
        
        console.log('Notifications initialized with preferences:', preferences);
      } catch (error) {
        console.error('Error initializing notifications:', error);
      }
    };

    initializeNotifications();

    // Cleanup on unmount
    return () => {
      notificationService.cleanup();
    };
  }, []);
};
