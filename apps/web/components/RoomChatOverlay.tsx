'use client';

import {
  CHAT_DRAFT_PLACEHOLDER,
  MAX_CHAT_TEXT_LENGTH,
  type RoomChatMessage,
} from '@metaverse2d/shared';
import { type CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import {
  AVATAR_WALK_FRAMES,
  CHARACTER_SPRITE_FRAME_HEIGHT,
  CHARACTER_SPRITE_FRAME_WIDTH,
  CHARACTER_SPRITE_SHEET_PATH,
  normalizeAvatarId,
} from '@/game/config/characterSpriteConfig';
import { getRoomChatState, subscribeToRoomChatState } from '@/lib/chatUiStore';
import { getRuntimeUiState, subscribeToRuntimeUiState } from '@/lib/runtimeUiStore';
import { getClientPlayerId, sendRoomChatMessage } from '@/network';

type RoomChatOverlayProps = {
  touchOptimized?: boolean;
};

type SpriteSheetMetrics = {
  width: number;
  height: number;
  columns: number;
};

const TOUCH_CHAT_MESSAGE_VIEWPORT_HEIGHT_CLASS = 'h-56';
const DESKTOP_CHAT_MESSAGE_VIEWPORT_HEIGHT_CLASS = 'h-52';
const CHAT_MESSAGE_SCROLL_BOTTOM_THRESHOLD_PX = 24;

let spriteSheetMetricsPromise: Promise<SpriteSheetMetrics> | null = null;

export function RoomChatOverlay({ touchOptimized = false }: RoomChatOverlayProps) {
  const { messages } = useSyncExternalStore(subscribeToRoomChatState, getRoomChatState, getRoomChatState);
  const runtimeUiState = useSyncExternalStore(subscribeToRuntimeUiState, getRuntimeUiState, getRuntimeUiState);
  const [isOpen, setIsOpen] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [spriteSheetMetrics, setSpriteSheetMetrics] = useState<SpriteSheetMetrics | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const shouldStickMessagesToBottomRef = useRef(true);
  const localPlayerId = getClientPlayerId();

  const messageRows = useMemo(
    () => messages.map((message) => toRoomChatMessageRow(message, localPlayerId)),
    [localPlayerId, messages],
  );

  useEffect(() => {
    let cancelled = false;
    void getSpriteSheetMetrics()
      .then((metrics) => {
        if (cancelled) {
          return;
        }
        setSpriteSheetMetrics(metrics);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('chat avatar sprite preview unavailable', error);
        setSpriteSheetMetrics(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !messageListRef.current) {
      return;
    }

    shouldStickMessagesToBottomRef.current = true;
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !messageListRef.current || !shouldStickMessagesToBottomRef.current) {
      return;
    }

    messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
  }, [isOpen, messageRows.length]);

  useEffect(() => {
    if (touchOptimized) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === 'Escape') {
        if (!isOpen) {
          return;
        }

        event.preventDefault();
        setIsOpen(false);
        messageInputRef.current?.blur();
        return;
      }

      if (event.key !== 'Tab' || isOpen || isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setIsOpen(true);
      window.requestAnimationFrame(() => {
        messageInputRef.current?.focus();
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, touchOptimized]);

  const safeAreaStyle: CSSProperties | undefined = touchOptimized
    ? {
      paddingTop: 'max(0px, env(safe-area-inset-top))',
      paddingRight: 'max(0px, env(safe-area-inset-right))',
      paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
    }
    : undefined;

  const shellPositionClass = touchOptimized
    ? 'right-2 top-36'
    : 'right-3 top-[7.75rem] sm:right-4 sm:top-[8.5rem]';
  const panelPositionClass = touchOptimized
    ? 'right-16 top-[-8rem]'
    : 'right-12 sm:right-14 top-[-8rem]';
  const panelWidthClass = touchOptimized ? 'w-[min(86vw,18rem)]' : 'w-[min(18rem,calc(100vw-1.5rem))]';
  const messageViewportHeightClass = touchOptimized
    ? TOUCH_CHAT_MESSAGE_VIEWPORT_HEIGHT_CLASS
    : DESKTOP_CHAT_MESSAGE_VIEWPORT_HEIGHT_CLASS;
  const shellZIndexClass = touchOptimized && isOpen ? 'z-40' : 'z-30';

  const canSend = draftMessage.trim().length > 0;

  const submitMessage = () => {
    if (!canSend) {
      return;
    }

    const didSend = sendRoomChatMessage(draftMessage);
    if (!didSend) {
      return;
    }

    setDraftMessage('');
  };

  return (
    <div className={`pointer-events-none absolute ${shellZIndexClass} ${shellPositionClass}`} style={safeAreaStyle}>
      {isOpen ? (
        <div
          className={`pointer-events-auto absolute ${panelPositionClass} ${panelWidthClass} overflow-hidden rounded-xl border border-white/15 bg-black/70 shadow-lg backdrop-blur`}
        >
          <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-200">
            Room chat
          </div>
          <div
            ref={messageListRef}
            className={`${messageViewportHeightClass} overflow-y-auto px-3 py-2 text-sm text-zinc-100`}
            onScroll={(event) => {
              const element = event.currentTarget;
              const distanceFromBottom =
                element.scrollHeight - element.scrollTop - element.clientHeight;
              shouldStickMessagesToBottomRef.current =
                distanceFromBottom <= CHAT_MESSAGE_SCROLL_BOTTOM_THRESHOLD_PX;
            }}
          >
            {messageRows.length === 0 ? (
              <p className="text-xs text-zinc-400">No messages yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {messageRows.map((row) => (
                  <li
                    key={row.id}
                    className={`rounded-md px-2 py-1.5 ${row.isOwnMessage ? 'bg-sky-500/20 text-sky-100' : 'bg-white/5 text-zinc-100'}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/15 bg-zinc-700/70">
                        {spriteSheetMetrics ? (
                          <div
                            className="absolute inset-0"
                            style={buildAvatarSpriteStyle(row.avatarId, spriteSheetMetrics)}
                          />
                        ) : null}
                        {!spriteSheetMetrics ? (
                          <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase text-zinc-100">
                            {row.senderInitial}
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-200">{row.senderName}</p>
                        <p className="break-words text-xs leading-relaxed">{row.text}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-white/10 p-2">
            <div className="flex items-center gap-2">
              <input
                ref={messageInputRef}
                type="text"
                value={draftMessage}
                maxLength={MAX_CHAT_TEXT_LENGTH}
                placeholder={CHAT_DRAFT_PLACEHOLDER}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-sky-400/70"
                onChange={(event) => {
                  setDraftMessage(event.target.value.slice(0, MAX_CHAT_TEXT_LENGTH));
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.shiftKey) {
                    return;
                  }
                  event.preventDefault();
                  submitMessage();
                }}
              />
              <button
                type="button"
                disabled={!canSend}
                className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-zinc-100 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={submitMessage}
              >
                Send
              </button>
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              {runtimeUiState.playerName ? `You are ${runtimeUiState.playerName}` : 'Connecting identity...'}
            </p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={isOpen ? 'Close room chat' : 'Open room chat'}
        className={`pointer-events-auto flex items-center justify-center rounded-full border border-white/15 bg-black/55 shadow-md backdrop-blur transition hover:bg-black/70 ${touchOptimized ? 'h-14 w-14' : 'h-11 w-11 sm:h-12 sm:w-12'}`}
        onClick={() => {
          setIsOpen((current) => !current);
        }}
      >
        <img
          src="/icons/chat-bubble.svg"
          alt=""
          aria-hidden="true"
          className={touchOptimized ? 'h-6 w-6' : 'h-5 w-5 sm:h-6 sm:w-6'}
          draggable={false}
        />
      </button>
    </div>
  );
}

type RoomChatMessageRow = {
  id: string;
  senderName: string;
  senderInitial: string;
  avatarId: number | undefined;
  text: string;
  isOwnMessage: boolean;
};

function toRoomChatMessageRow(
  message: RoomChatMessage,
  localPlayerId: string | null,
): RoomChatMessageRow {
  const normalizedSenderName = message.senderName || 'player';
  const senderInitial = resolveSenderInitial(normalizedSenderName);

  return {
    id: message.id,
    senderName: normalizedSenderName,
    senderInitial,
    avatarId: message.avatarId,
    text: message.text,
    isOwnMessage: Boolean(localPlayerId && message.senderId === localPlayerId),
  };
}

function resolveSenderInitial(senderName: string): string {
  const normalized = senderName.trim();
  const firstCharacter = normalized.charAt(0);
  if (!firstCharacter) {
    return '?';
  }

  return firstCharacter.toUpperCase();
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}

function getSpriteSheetMetrics(): Promise<SpriteSheetMetrics> {
  if (!spriteSheetMetricsPromise) {
    spriteSheetMetricsPromise = new Promise<SpriteSheetMetrics>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const columns = Math.max(1, Math.floor(image.naturalWidth / CHARACTER_SPRITE_FRAME_WIDTH));
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          columns,
        });
      };
      image.onerror = () => {
        reject(new Error(`Failed to load character sprite sheet: ${CHARACTER_SPRITE_SHEET_PATH}`));
      };
      image.src = CHARACTER_SPRITE_SHEET_PATH;
    });
  }

  return spriteSheetMetricsPromise;
}

function buildAvatarSpriteStyle(
  avatarId: number | undefined,
  spriteSheetMetrics: SpriteSheetMetrics,
): CSSProperties {
  const normalizedAvatarId = normalizeAvatarId(avatarId);
  const frameIndex = AVATAR_WALK_FRAMES[normalizedAvatarId].down.start;
  const column = frameIndex % spriteSheetMetrics.columns;
  const row = Math.floor(frameIndex / spriteSheetMetrics.columns);
  const frameWidth = CHARACTER_SPRITE_FRAME_WIDTH;
  const frameHeight = CHARACTER_SPRITE_FRAME_HEIGHT;
  const spriteScale = 7 / 4;
  const offsetX = column * frameWidth;
  const offsetY = row * frameHeight;

  return {
    backgroundImage: `url(${CHARACTER_SPRITE_SHEET_PATH})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${spriteSheetMetrics.width * spriteScale}px ${spriteSheetMetrics.height * spriteScale}px`,
    backgroundPosition: `-${offsetX * spriteScale}px -${offsetY * spriteScale}px`,
    imageRendering: 'pixelated',
    width: '100%',
    height: '100%',
  };
}
