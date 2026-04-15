import { useRouter } from 'expo-router';
import { useState } from 'react';

import { requestForegroundLocationPermission } from '@/src/core/location/locationPermissionClient';
import { OnboardingStepScreen } from '@/src/features/auth/components/OnboardingStepScreen';
import { FIRST_RUN_ONBOARDING_STEPS, FIRST_RUN_ONBOARDING_TOTAL_STEPS } from '@/src/features/auth/onboardingSteps';

export default function OnboardingLocationScreen() {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  const handleContinue = async () => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await requestForegroundLocationPermission();
    } catch (error) {
      console.warn('[onboarding] Failed to request location permission.', error);
    } finally {
      setIsBusy(false);
    }

    router.push('/(auth)/onboarding/ready');
  };

  return (
    <OnboardingStepScreen
      {...FIRST_RUN_ONBOARDING_STEPS.location}
      isBusy={isBusy}
      onPress={handleContinue}
      stepNumber={3}
      totalSteps={FIRST_RUN_ONBOARDING_TOTAL_STEPS}
    />
  );
}
