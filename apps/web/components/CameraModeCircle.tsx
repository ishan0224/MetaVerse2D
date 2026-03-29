'use client';

import { useState, useSyncExternalStore } from 'react';

import {
  getVoiceControlState,
  setCameraEnabled,
  setCameraPermissionStatus,
  subscribeToVoiceControlState,
} from '@/game/systems/voiceControlStore';
import { getRTCManager } from '@/network/rtc/rtcManager';

export function CameraModeCircle() {
  const voiceState = useSyncExternalStore(
    subscribeToVoiceControlState,
    getVoiceControlState,
    getVoiceControlState,
  );
  const [isBusy, setIsBusy] = useState(false);

  const handleClick = () => {
    if (isBusy) {
      return;
    }

    if (voiceState.cameraEnabled) {
      setCameraEnabled(false);
      return;
    }

    if (voiceState.cameraPermissionStatus === 'GRANTED' || getRTCManager().hasCameraTrack()) {
      setCameraPermissionStatus('GRANTED');
      setCameraEnabled(true);
      return;
    }

    setIsBusy(true);
    setCameraPermissionStatus('REQUESTING');
    void getRTCManager()
      .requestCameraAccess()
      .then((result) => {
        if (result === 'granted') {
          setCameraPermissionStatus('GRANTED');
          setCameraEnabled(true);
          return;
        }

        setCameraPermissionStatus('BLOCKED');
        setCameraEnabled(false);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  const iconClass = getCameraIconClass(voiceState.cameraEnabled, voiceState.cameraPermissionStatus);

  return (
    <div className="absolute right-3 top-[6.8rem] z-20 sm:right-4 sm:top-[7.2rem]">
      <button
        type="button"
        onClick={handleClick}
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-zinc-100 shadow-md backdrop-blur transition-transform duration-150 ease-out hover:-translate-y-1 sm:h-12 sm:w-12 ${
          isBusy ? 'cursor-wait opacity-80' : ''
        }`}
        aria-label={getCameraAriaLabel(voiceState.cameraEnabled, voiceState.cameraPermissionStatus)}
      >
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${iconClass}`} fill="none" aria-hidden="true">
          <rect x="3" y="7" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="m15 10 5-3v10l-5-3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          {voiceState.cameraEnabled ? null : (
            <path d="m4 4 16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          )}
        </svg>
      </button>
    </div>
  );
}

function getCameraIconClass(
  cameraEnabled: boolean,
  permissionStatus: ReturnType<typeof getVoiceControlState>['cameraPermissionStatus'],
): string {
  if (cameraEnabled) {
    return 'text-emerald-500';
  }

  if (permissionStatus === 'BLOCKED') {
    return 'text-rose-500';
  }

  return 'text-zinc-300';
}

function getCameraAriaLabel(
  cameraEnabled: boolean,
  permissionStatus: ReturnType<typeof getVoiceControlState>['cameraPermissionStatus'],
): string {
  if (cameraEnabled) {
    return 'Camera on';
  }

  if (permissionStatus === 'BLOCKED') {
    return 'Camera blocked';
  }

  return 'Camera off';
}
