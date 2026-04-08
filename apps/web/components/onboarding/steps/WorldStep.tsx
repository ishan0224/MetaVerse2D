'use client';

import { Button } from '@/components/ui';

import { WORLD_OPTIONS } from '../worldOptions';

type WorldStepProps = {
  visible: boolean;
  worldId: string;
  onWorldChange: (worldId: string) => void;
  onBack: () => void;
  onContinue: () => void;
};

export function WorldStep({
  visible,
  worldId,
  onWorldChange,
  onBack,
  onContinue,
}: WorldStepProps) {
  if (!visible) {
    return null;
  }

  return (
    <section className="p-5 md:p-8">
      <h2 className="text-center text-4xl font-bold text-white sm:text-5xl">Select your desired world</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WORLD_OPTIONS.map((world) => {
          const selected = world.id === worldId;
          return (
            <button
              key={world.id}
              type="button"
              onClick={() => onWorldChange(world.id)}
              className={`group relative min-h-[220px] overflow-hidden rounded-2xl border bg-cover bg-center text-left transition-[transform,border-color] duration-90 ease-out will-change-transform hover:-translate-y-1 hover:scale-[1.008] ${selected
                ? 'border-cyan-200/80'
                : 'border-white/40 hover:border-cyan-200/80'
                }`}
              style={{ backgroundImage: `url(${world.previewImage})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-900/28 to-slate-900/10" />
              <div className="relative flex h-full items-end p-2">
                <div className="w-full rounded-xl border border-cyan-100/70 bg-black/38 p-4 shadow-[0_4px_14px_rgba(0,0,0,0.3)]">
                  <p className="text-xl font-semibold text-zinc-50 sm:text-2xl">{world.title}</p>
                  <p className="mt-1 text-lg text-zinc-200 sm:text-xl">{world.subtitle}</p>
                </div>
              </div>
              {selected ? (
                <span className="absolute right-3 top-3 z-10 rounded-md bg-cyan-300/90 px-2 py-1 text-xs font-bold uppercase tracking-wider text-slate-950">
                  Selected
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 text-right text-sm uppercase tracking-widest text-zinc-400 sm:text-base">
        More worlds to be added soon
      </div>
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button onClick={onBack} variant="secondary" fullWidthOnMobile>
          Back
        </Button>
        <Button
          onClick={onContinue}
          variant="primary"
          fullWidthOnMobile
          className="border-transparent bg-gradient-to-r from-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300"
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
