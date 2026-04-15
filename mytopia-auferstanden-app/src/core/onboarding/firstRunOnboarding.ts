import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRST_RUN_ONBOARDING_KEY = 'mytopia:first-run-onboarding:v1';

export async function hasCompletedFirstRunOnboarding() {
  return (await AsyncStorage.getItem(FIRST_RUN_ONBOARDING_KEY)) === 'true';
}

export async function markFirstRunOnboardingComplete() {
  await AsyncStorage.setItem(FIRST_RUN_ONBOARDING_KEY, 'true');
}
