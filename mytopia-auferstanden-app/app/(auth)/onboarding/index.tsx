import { useRouter } from 'expo-router';

import { OnboardingStepScreen } from '@/src/features/auth/components/OnboardingStepScreen';
import { FIRST_RUN_ONBOARDING_STEPS, FIRST_RUN_ONBOARDING_TOTAL_STEPS } from '@/src/features/auth/onboardingSteps';

export default function OnboardingIntroScreen() {
  const router = useRouter();

  return (
    <OnboardingStepScreen
      {...FIRST_RUN_ONBOARDING_STEPS.intro}
      onPress={() => router.push('/(auth)/onboarding/notifications')}
      stepNumber={1}
      totalSteps={FIRST_RUN_ONBOARDING_TOTAL_STEPS}
    />
  );
}
