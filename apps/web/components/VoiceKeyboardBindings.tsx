'use client';

import { useEffect } from 'react';

import {
  cycleVoiceMode,
  setKeyboardPushToTalkPressed,
  setUIPushToTalkPressed,
} from '@/game/systems/voiceControlStore';
import { resetInactivityTimer } from '@/lib/inactivityUiStore';

export function VoiceKeyboardBindings() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) {
        return;
      }

      if (event.code === 'KeyM' && !event.repeat) {
        cycleVoiceMode();
        resetInactivityTimer('manual-presence');
        return;
      }

      if (event.code !== 'Space' || event.repeat) {
        return;
      }

      resetInactivityTimer('ptt');
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
