import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ensureNarrativeTopicSubscription, requestNotificationPermission } from '@/src/core/firebase/messagingClient';
import { syncFcmTokenForUser } from '@/src/core/firebase/useFcmTokenSync';
import { useSession } from '@/src/core/session/SessionContext';
import { OnboardingStepScreen } from '@/src/features/auth/components/OnboardingStepScreen';
import { FIRST_RUN_ONBOARDING_STEPS, FIRST_RUN_ONBOARDING_TOTAL_STEPS } from '@/src/features/auth/onboardingSteps';

export default function OnboardingNotificationsScreen() {
  const router = useRouter();
  const { selectedMode, user } = useSession();
  const [isBusy, setIsBusy] = useState(false);

  const handleContinue = async () => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      const status = await requestNotificationPermission();

      if (status === 'granted' && user) {
        await Promise.all([ensureNarrativeTopicSubscription(selectedMode), syncFcmTokenForUser(user.id)]);
      }
    } catch (error) {
      console.warn('[onboarding] Failed to request notification permission.', error);
    } finally {
      setIsBusy(false);
    }

    router.push('/(auth)/onboarding/location');
  };

  return (
    <OnboardingStepScreen
      {...FIRST_RUN_ONBOARDING_STEPS.notifications}
      isBusy={isBusy}
      onPress={handleContinue}
      stepNumber={2}
      totalSteps={FIRST_RUN_ONBOARDING_TOTAL_STEPS}
    />
  );
}
