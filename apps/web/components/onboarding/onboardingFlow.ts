import type { OnboardingStep } from './onboardingTypes';

export function getOnboardingStepNumber(step: OnboardingStep): number {
  switch (step) {
    case 'name':
      return 1;
    case 'avatar':
      return 2;
    case 'world':
      return 3;
    case 'roomConfirm':
      return 4;
  }
}

export function getPreviousOnboardingStep(step: OnboardingStep): OnboardingStep | null {
  switch (step) {
    case 'name':
      return null;
    case 'avatar':
      return 'name';
    case 'world':
      return 'avatar';
    case 'roomConfirm':
      return 'world';
  }
}
