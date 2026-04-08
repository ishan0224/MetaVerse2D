import type { ReactNode } from 'react';

type OnboardingMainPanelProps = {
  currentStepNumber: number;
  children: ReactNode;
};

export function OnboardingMainPanel({
  currentStepNumber,
  children,
}: OnboardingMainPanelProps) {
  return (
    <div className="w-full max-w-5xl">
      <div className="mb-3 text-center sm:mb-4">
        <span className="inline-flex rounded-full bg-black/30 px-4 py-1.5">
          <h1 className="onboarding-readable-text-strong text-4xl font-extrabold uppercase tracking-[0.12em] text-orange-100 sm:text-5xl sm:tracking-[0.18em] lg:text-6xl">
            Meta Verse 2D
          </h1>
        </span>
      </div>

      <div className="ui-flow-box onboarding-panel-in [contain:layout_paint] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 px-5 py-3 sm:px-7">
          <span className="text-sm uppercase tracking-[0.18em] text-sky-100/90 sm:text-base">Onboarding</span>
          <span className="text-sm font-semibold text-sky-50/90 sm:text-base">Step {currentStepNumber} / 4</span>
        </div>
        {children}
      </div>
    </div>
  );
}
