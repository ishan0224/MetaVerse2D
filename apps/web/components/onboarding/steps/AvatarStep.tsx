'use client';

import { Button, PanelSection } from '@/components/ui';
import {
  AVATAR_IDS,
  type AvatarId,
} from '@/game/config/characterSpriteConfig';

import { AvatarSpritePreview } from '../AvatarSpritePreview';

type AvatarStepProps = {
  visible: boolean;
  avatarId: AvatarId;
  onAvatarChange: (avatarId: AvatarId) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function AvatarStep({
  visible,
  avatarId,
  onAvatarChange,
  onBack,
  onContinue,
}: AvatarStepProps) {
  if (!visible) {
    return null;
  }

  return (
    <PanelSection
      left={
        <>
          <h2 className="text-4xl font-bold text-white sm:text-5xl">Please select your avatar</h2>
          <div className="mt-5 grid gap-2">
            {AVATAR_IDS.map((candidate) => {
              const selected = candidate === avatarId;
              return (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => onAvatarChange(candidate)}
                  className={`rounded-xl border px-4 py-3 text-left text-lg font-semibold transition-colors duration-75 ease-out sm:text-xl ${
                    selected
                      ? 'border-cyan-200/80 bg-cyan-400/20 text-cyan-50 shadow-[0_0_0_1px_rgba(125,211,252,0.4)]'
                      : 'border-white/30 bg-black/42 text-zinc-100 hover:border-cyan-200/60 hover:bg-cyan-500/20'
                  }`}
                >
                  Avatar {candidate}
                </button>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-between gap-2">
            <Button onClick={onBack} variant="secondary">
              Back
            </Button>
            <Button onClick={onContinue} variant="primary" className="border-transparent bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300">
              Continue
            </Button>
          </div>
        </>
      }
      right={
        <div className="w-full max-w-xs rounded-2xl border border-cyan-200/40 bg-slate-950/22 p-5 shadow-[0_12px_30px_rgba(14,116,144,0.26)]">
          <p className="text-center text-sm uppercase tracking-[0.2em] text-cyan-100/95 sm:text-base">Animated Preview</p>
          <div className="mt-4 flex items-center justify-center rounded-xl border border-white/30 bg-black/28 py-8">
            <AvatarSpritePreview avatarId={avatarId} />
          </div>
        </div>
      }
    />
  );
}
