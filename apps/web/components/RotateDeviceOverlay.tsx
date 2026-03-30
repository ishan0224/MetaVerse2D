'use client';

export function RotateDeviceOverlay() {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/88 px-6 text-center text-zinc-100">
      <div className="max-w-sm rounded-2xl border border-white/25 bg-black/55 p-5 shadow-xl backdrop-blur-md">
        <div className="mb-3 flex justify-center" aria-hidden="true">
          <span className="rounded-md border border-white/40 px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-200">
            Landscape
          </span>
        </div>
        <h2 className="text-xl font-bold sm:text-2xl">Rotate Your Device</h2>
        <p className="mt-2 text-sm text-zinc-200 sm:text-base">
          This game is optimized for landscape on mobile and tablet. Please rotate your device to continue.
        </p>
      </div>
    </div>
  );
}
