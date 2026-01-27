import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AppStorage from '@/src/utils/storage/storage';
import * as Device from 'expo-device';
import { supabase } from '@/src/lib/supabase/supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationPreferences {
  frequency: 'daily' | '3times' | 'weekly' | 'never';
  enabled: boolean;
}

export class NotificationService {
  private static instance: NotificationService;
  private notificationListener: Notifications.Subscription | null = null;
  private responseListener: Notifications.Subscription | null = null;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Check current notification permission status
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error checking notification permissions:', error);
      return false;
    }
  }

  /**
   * Request notification permissions from the user
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permission denied');
        return false;
      }

      // Configure notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Financify Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4A90E2',
        });
      }

      // Register push token after permissions granted
      await this.registerPushToken();

      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Save notification preferences to AsyncStorage
   */
  async savePreferences(preferences: NotificationPreferences): Promise<void> {
    try {
      AppStorage.setItemSync('notificationPreferences', JSON.stringify(preferences));
    } catch (error) {
      console.error('Error saving notification preferences:', error);
    }
  }

  /**
   * Load notification preferences from AsyncStorage
   */
  async loadPreferences(): Promise<NotificationPreferences> {
    try {
      const stored = AppStorage.getItemSync('notificationPreferences');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading notification preferences:', error);
    }
    
    // Default preferences
    return {
      frequency: 'daily',
      enabled: true,
    };
  }

  /**
   * Schedule recurring notifications based on user preferences
   */
  async scheduleNotifications(preferences: NotificationPreferences): Promise<void> {
    try {
      // Cancel all existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();

      if (!preferences.enabled || preferences.frequency === 'never') {
        return;
      }

      const notifications = this.generateNotificationSchedule(preferences.frequency);
      
      for (const notification of notifications) {
        await Notifications.scheduleNotificationAsync(notification);
      }

      console.log(`Scheduled ${notifications.length} notifications`);
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  }

  /**
   * Generate notification schedule based on frequency
   */
  private generateNotificationSchedule(frequency: 'daily' | '3times' | 'weekly' | 'never') {
    const notifications: Notifications.NotificationRequestInput[] = [];
    const now = new Date();

    switch (frequency) {
      case 'daily':
        // Daily at 9 AM
        notifications.push({
          content: {
            title: "💰 Finny Check-in",
            body: "Hey! How's your money doing today? Let's take a quick look!",
            data: { type: 'checkin' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: 9,
            minute: 0,
          },
        });
        break;

      case '3times':
        // Monday, Wednesday, Friday at 9 AM
        const weekdays = [1, 3, 5]; // Monday, Wednesday, Friday
        weekdays.forEach(weekday => {
          notifications.push({
            content: {
              title: "💰 Finny Check-in",
              body: "Time for your mid-week money check! How are things looking?",
              data: { type: 'checkin' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday,
              hour: 9,
              minute: 0,
            },
          });
        });
        break;

      case 'weekly':
        // Every Monday at 9 AM
        notifications.push({
          content: {
            title: "💰 Weekly Finny Check-in",
            body: "Start your week right! Let's review your financial goals.",
            data: { type: 'checkin' },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: 1, // Monday
            hour: 9,
            minute: 0,
          },
        });
        break;
    }

    return notifications;
  }

  /**
   * Send a test notification immediately
   */
  async sendTestNotification(): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🧪 Test Notification",
          body: "Hey, your money's worried? Have a look chief!",
          data: { type: 'test' },
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  }

  /**
   * Send a motivational notification
   */
  async sendMotivationalNotification(): Promise<void> {
    const messages = [
      "Hey, your money's worried? Have a look chief!",
      "Your financial goals are calling! 📞",
      "Time to check in with your money! 💰",
      "Don't let your goals slip away! 🎯",
      "Your future self will thank you! 🌟",
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "💰 Finny Reminder",
          body: randomMessage,
          data: { type: 'motivational' },
        },
        trigger: null, // Send immediately
      });
    } catch (error) {
      console.error('Error sending motivational notification:', error);
    }
  }

  /**
   * Setup notification listeners
   */
  setupListeners(): void {
    // Listen for notifications received while app is foregrounded
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Listen for user interactions with notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      const { type } = response.notification.request.content.data as { type: string };
      
      // Handle different notification types
      switch (type) {
        case 'checkin':
          // Navigate to goals or chat screen
          console.log('User tapped check-in notification');
          break;
        case 'test':
          console.log('User tapped test notification');
          break;
        case 'motivational':
          console.log('User tapped motivational notification');
          break;
      }
    });
  }

  /**
   * Cleanup notification listeners
   */
  cleanup(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  /**
   * Get all scheduled notifications
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return [];
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error canceling notifications:', error);
    }
  }

  /**
   * Register Expo push token with backend
   */
  async registerPushToken(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        console.log('No authenticated user, skipping push token registration');
        return;
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '1ec2fed7-76cd-4a3f-ab46-66a01f7ddb65', // From app.config.ts
      });
      const expoPushToken = tokenData.data;

      // Generate or get device ID
      const deviceIdKey = 'device_id';
      let deviceId = AppStorage.getItemSync(deviceIdKey);
      if (!deviceId) {
        // Generate a simple device identifier
        const deviceInfo = `${Platform.OS}-${Device.modelName || 'unknown'}-${Device.osVersion || 'unknown'}`;
        deviceId = deviceInfo;
        AppStorage.setItemSync(deviceIdKey, deviceId);
      }

      // Upsert push token in database
      const { error } = await supabase
        .from('user_push_tokens')
        .upsert({
          user_id: user.id,
          expo_push_token: expoPushToken,
          device_id: deviceId,
          platform: Platform.OS as 'ios' | 'android',
          is_active: true,
        }, {
          onConflict: 'user_id,device_id',
        });

      if (error) {
        console.error('Error registering push token:', error);
      } else {
        console.log('Push token registered successfully');
      }
    } catch (error) {
      console.error('Error registering push token:', error);
    }
  }

  /**
   * Sync notification preferences to database
   */
  async syncPreferencesToDatabase(): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        console.log('No authenticated user, skipping preferences sync');
        return;
      }

      const localPreferences = await this.loadPreferences();

      // Upsert preferences in database
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          proactive_enabled: localPreferences.enabled,
          checkin_frequency: localPreferences.frequency,
          max_notifications_per_day: 5, // Default
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        console.error('Error syncing preferences to database:', error);
      } else {
        console.log('Preferences synced to database successfully');
      }
    } catch (error) {
      console.error('Error syncing preferences to database:', error);
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();
