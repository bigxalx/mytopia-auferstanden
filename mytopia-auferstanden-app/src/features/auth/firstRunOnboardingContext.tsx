import { createContext, ReactNode, useContext } from 'react';

type FirstRunOnboardingContextValue = {
  completeOnboarding: () => Promise<void>;
  hasPendingOnboarding: boolean;
  isCheckingOnboarding: boolean;
};

const FirstRunOnboardingContext = createContext<FirstRunOnboardingContextValue | null>(null);

export function FirstRunOnboardingProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: FirstRunOnboardingContextValue;
}) {
  return <FirstRunOnboardingContext.Provider value={value}>{children}</FirstRunOnboardingContext.Provider>;
}

export function useFirstRunOnboarding() {
  const context = useContext(FirstRunOnboardingContext);

  if (!context) {
    throw new Error('useFirstRunOnboarding must be used within FirstRunOnboardingProvider.');
  }

  return context;
}
