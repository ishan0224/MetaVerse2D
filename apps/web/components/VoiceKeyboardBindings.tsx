'use client';

import { useEffect } from 'react';

import {
  cycleVoiceMode,
  getVoiceControlState,
  setCameraEnabled,
  setCameraPermissionStatus,
  setKeyboardPushToTalkPressed,
  setUIPushToTalkPressed,
} from '@/game/systems/voiceControlStore';
import { getRTCManager } from '@/network/rtc/rtcManager';

export function VoiceKeyboardBindings() {
  useEffect(() => {
    let cameraRequestInFlight = false;

    const handleCameraToggle = () => {
      if (cameraRequestInFlight) {
        return;
      }

      const voiceState = getVoiceControlState();
      if (voiceState.cameraEnabled) {
        setCameraEnabled(false);
        return;
      }

      if (voiceState.cameraPermissionStatus === 'GRANTED' || getRTCManager().hasCameraTrack()) {
        setCameraPermissionStatus('GRANTED');
        setCameraEnabled(true);
        return;
      }

      cameraRequestInFlight = true;
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
          cameraRequestInFlight = false;
        });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) {
        return;
      }

      if (event.code === 'KeyM' && !event.repeat) {
        cycleVoiceMode();
        return;
      }

      if (event.code === 'KeyV' && !event.repeat) {
        handleCameraToggle();
        return;
      }

      if (event.code !== 'Space' || event.repeat) {
        return;
      }

      setKeyboardPushToTalkPressed(true);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      setKeyboardPushToTalkPressed(false);
    };

    const onWindowBlur = () => {
      setKeyboardPushToTalkPressed(false);
      setUIPushToTalkPressed(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  return null;
}

function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}
