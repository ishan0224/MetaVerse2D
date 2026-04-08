'use client';

import { useEffect, useRef } from 'react';

import {
  Button,
  FormLabel,
  TextInput,
} from '@/components/ui';

type RoomConfirmStepProps = {
  visible: boolean;
  roomId: string;
  roomError: string | null;
  isClosingRoomStrip: boolean;
  canConfirmRoom: boolean;
  onRoomIdChange: (roomId: string) => void;
  onBack: () => void;
  onNo: () => void;
  onConfirm: () => void;
};

export function RoomConfirmStep({
  visible,
  roomId,
  roomError,
  isClosingRoomStrip,
  canConfirmRoom,
  onRoomIdChange,
  onBack,
  onNo,
  onConfirm,
}: RoomConfirmStepProps) {
  const roomInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (visible && roomInputRef.current) {
      roomInputRef.current.focus();
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="w-full max-w-5xl sm:flex sm:min-h-full sm:items-center">
      <div
        className={`ui-flow-box [contain:layout_paint] w-full px-5 py-6 sm:px-7 ${
          isClosingRoomStrip ? 'onboarding-room-strip-out' : 'onboarding-room-strip-in'
        }`}
      >
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr] sm:items-end">
          <div>
            <h2 className="text-4xl font-bold text-zinc-100 sm:text-5xl">Enter room ID</h2>
            <p className="mt-1 text-lg text-zinc-200 sm:text-xl">Use the same room ID to join friends in the same world.</p>
            <FormLabel htmlFor="onboarding-room-id">Room ID</FormLabel>
            <TextInput
              ref={roomInputRef}
              id="onboarding-room-id"
              value={roomId}
              onChange={(event) => {
                onRoomIdChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onConfirm();
                }
              }}
              disabled={isClosingRoomStrip}
              maxLength={24}
              placeholder="example-room-01"
              error={roomError ?? ''}
              errorClassName="pt-2 text-base text-rose-300 sm:text-lg"
            />
          </div>

          <div className="sm:pb-1">
            <p className="text-lg font-semibold uppercase tracking-[0.18em] text-cyan-50 sm:text-xl">Are you sure?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                onClick={() => {
                  onNo();
                  roomInputRef.current?.focus();
                }}
                disabled={isClosingRoomStrip}
                variant="dismiss"
              >
                No
              </Button>
              <Button
                onClick={onConfirm}
                disabled={isClosingRoomStrip || !canConfirmRoom}
                variant="danger"
                className="font-bold"
              >
                Yes
              </Button>
            </div>
            <Button
              onClick={onBack}
              disabled={isClosingRoomStrip}
              variant="primary"
              className="mt-3 w-full border-2 border-cyan-100 bg-cyan-300/45 text-cyan-50 shadow-[0_2px_10px_rgba(0,0,0,0.34)] uppercase tracking-wider hover:bg-cyan-300/60"
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
