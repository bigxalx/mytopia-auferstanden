import {
  getCrashlytics,
  setCrashlyticsCollectionEnabled,
} from '@react-native-firebase/crashlytics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PRIVACY_CONSENT_KEY = 'mytopia_telemetry_consent';

/**
 * EU/GDPR compliance controller for Crashlytics.
 *
 * Native defaults come from RNFirebase's supported config surfaces such as `firebase.json`.
 * This manager applies the runtime opt-in based on user consent.
 */
export const PrivacyManager = {
  /**
   * Initializes consent from storage.
   */
  initialize: async () => {
    const consent = await AsyncStorage.getItem(PRIVACY_CONSENT_KEY);
    if (consent !== null) {
      await PrivacyManager.setTelemetryConsent(consent === 'true', false);
    }
  },

  getConsent: async () => {
    const consent = await AsyncStorage.getItem(PRIVACY_CONSENT_KEY);
    return consent === 'true';
  },

  /**
   * Enables or disables Firebase Crashlytics telemetry.
   * Call this after the user has accepted/rejected the privacy policy.
   */
  setTelemetryConsent: async (enabled: boolean, save = true) => {
    try {
      await setCrashlyticsCollectionEnabled(getCrashlytics(), enabled);

      if (save) {
        await AsyncStorage.setItem(PRIVACY_CONSENT_KEY, enabled.toString());
      }
    } catch (error) {
      console.error('[PrivacyManager] Error setting telemetry status:', error);
    }
  },
};
