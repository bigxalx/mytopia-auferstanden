import { router } from 'expo-router';
import { useState } from 'react';

import { useFirstRunOnboarding } from '@/src/features/auth/firstRunOnboardingContext';
import { OnboardingStepScreen } from '@/src/features/auth/components/OnboardingStepScreen';
import { FIRST_RUN_ONBOARDING_STEPS, FIRST_RUN_ONBOARDING_TOTAL_STEPS } from '@/src/features/auth/onboardingSteps';

export default function OnboardingReadyScreen() {
  const { completeOnboarding } = useFirstRunOnboarding();
  const [isBusy, setIsBusy] = useState(false);

  const handleFinish = async () => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await completeOnboarding();
      router.dismissTo('/sign-in');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <OnboardingStepScreen
      {...FIRST_RUN_ONBOARDING_STEPS.ready}
      isBusy={isBusy}
      onPress={handleFinish}
      stepNumber={4}
      totalSteps={FIRST_RUN_ONBOARDING_TOTAL_STEPS}
    />
  );
}
