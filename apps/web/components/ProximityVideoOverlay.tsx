'use client';

import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  getProximityVideoOverlayState,
  subscribeToProximityVideoOverlay,
} from '@/lib/proximityVideoOverlayStore';
import { getRTCManager } from '@/network/rtc/rtcManager';

export function ProximityVideoOverlay() {
  const overlayState = useSyncExternalStore(
    subscribeToProximityVideoOverlay,
    getProximityVideoOverlayState,
    getProximityVideoOverlayState,
  );

  const mediaState = useSyncExternalStore(
    (listener) => getRTCManager().subscribeToRemotePeerMedia(listener),
    () => getRTCManager().getRemotePeerMediaSnapshot(),
    () => [],
  );

  if (overlayState.players.length === 0) {
    return null;
  }

  const mediaByPeerId = new Map(mediaState.map((entry) => [entry.peerId, entry]));
  const visiblePlayers = overlayState.players.flatMap((player) => {
    const peerMedia = mediaByPeerId.get(player.id);
    if (!peerMedia || !peerMedia.hasVideo || !peerMedia.stream) {
      return [];
    }

    return [
      {
        ...player,
        stream: peerMedia.stream,
      },
    ];
  });
  if (visiblePlayers.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {visiblePlayers.map((player) => (
        <PeerVideoBubble
          key={player.id}
          playerName={player.name}
          screenX={player.screenX}
          screenY={player.screenY}
          stream={player.stream}
        />
      ))}
    </div>
  );
}

type PeerVideoBubbleProps = {
  playerName: string;
  screenX: number;
  screenY: number;
  stream: MediaStream;
};

const PeerVideoBubble = memo(function PeerVideoBubble({ playerName, screenX, screenY, stream }: PeerVideoBubbleProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoActive, setIsVideoActive] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) {
      return;
    }

    let lastRenderedFrameCount = 0;
    let lastRenderedFrameAtMs = Number.NEGATIVE_INFINITY;
    const trackUnsubscribers = new Map<MediaStreamTrack, () => void>();

    const applyVideoActivity = (nextValue: boolean) => {
      setIsVideoActive((currentValue) => {
        if (currentValue === nextValue) {
          return currentValue;
        }
        return nextValue;
      });
    };

    const evaluateVideoActivity = () => {
      const videoTracks = stream.getVideoTracks();
      const hasLiveVideoTrack = videoTracks.some((track) => track.readyState === 'live');
      if (!hasLiveVideoTrack) {
        applyVideoActivity(false);
        return;
      }

      if (typeof videoElement.getVideoPlaybackQuality === 'function') {
        const playbackQuality = videoElement.getVideoPlaybackQuality();
        const nowMs = performance.now();
        if (playbackQuality.totalVideoFrames > lastRenderedFrameCount) {
          lastRenderedFrameCount = playbackQuality.totalVideoFrames;
          lastRenderedFrameAtMs = nowMs;
        }

        applyVideoActivity(nowMs - lastRenderedFrameAtMs <= 1500);
        return;
      }

      const hasUnmutedLiveVideoTrack = videoTracks.some(
        (track) => track.readyState === 'live' && !track.muted,
      );
      const hasCurrentFrame =
        videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoElement.videoWidth > 0 &&
        videoElement.videoHeight > 0 &&
        !videoElement.paused &&
        !videoElement.ended;
      applyVideoActivity(hasUnmutedLiveVideoTrack && hasCurrentFrame);
    };

    const syncTrackListeners = () => {
      const tracks = stream.getVideoTracks();
      for (const track of tracks) {
        if (trackUnsubscribers.has(track)) {
          continue;
        }

        const onTrackStateChange = () => {
          evaluateVideoActivity();
        };
        track.addEventListener('ended', onTrackStateChange);
        track.addEventListener('mute', onTrackStateChange);
        track.addEventListener('unmute', onTrackStateChange);
        trackUnsubscribers.set(track, () => {
          track.removeEventListener('ended', onTrackStateChange);
          track.removeEventListener('mute', onTrackStateChange);
          track.removeEventListener('unmute', onTrackStateChange);
        });
      }

      for (const [trackedTrack, unsubscribe] of trackUnsubscribers) {
        if (tracks.includes(trackedTrack)) {
          continue;
        }

        unsubscribe();
        trackUnsubscribers.delete(trackedTrack);
      }
    };

    const onStreamTrackSetChange = () => {
      syncTrackListeners();
      evaluateVideoActivity();
    };

    const onVideoElementStateChange = () => {
      evaluateVideoActivity();
    };

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
    }
    void videoElement.play().catch(() => {
      return;
    });

    stream.addEventListener('addtrack', onStreamTrackSetChange);
    stream.addEventListener('removetrack', onStreamTrackSetChange);
    videoElement.addEventListener('playing', onVideoElementStateChange);
    videoElement.addEventListener('pause', onVideoElementStateChange);
    videoElement.addEventListener('ended', onVideoElementStateChange);
    videoElement.addEventListener('emptied', onVideoElementStateChange);
    videoElement.addEventListener('stalled', onVideoElementStateChange);
    videoElement.addEventListener('waiting', onVideoElementStateChange);
    videoElement.addEventListener('loadeddata', onVideoElementStateChange);

    syncTrackListeners();
    evaluateVideoActivity();

    const frameMonitor = setInterval(() => {
      evaluateVideoActivity();
    }, 600);

    return () => {
      clearInterval(frameMonitor);
      stream.removeEventListener('addtrack', onStreamTrackSetChange);
      stream.removeEventListener('removetrack', onStreamTrackSetChange);
      videoElement.removeEventListener('playing', onVideoElementStateChange);
      videoElement.removeEventListener('pause', onVideoElementStateChange);
      videoElement.removeEventListener('ended', onVideoElementStateChange);
      videoElement.removeEventListener('emptied', onVideoElementStateChange);
      videoElement.removeEventListener('stalled', onVideoElementStateChange);
      videoElement.removeEventListener('waiting', onVideoElementStateChange);
      videoElement.removeEventListener('loadeddata', onVideoElementStateChange);
      for (const unsubscribe of trackUnsubscribers.values()) {
        unsubscribe();
      }
      trackUnsubscribers.clear();
      if (videoElement.srcObject === stream) {
        videoElement.srcObject = null;
      }
      applyVideoActivity(false);
    };
  }, [stream]);

  return (
    <div
      className={`absolute w-28 transition-opacity duration-150 sm:w-32 ${
        isVideoActive ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: `${screenX * 100}%`,
        top: `${screenY * 100}%`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="overflow-hidden rounded-xl border border-cyan-100/70 bg-black/45 shadow-[0_6px_16px_rgba(0,0,0,0.4)] backdrop-blur-[1px]">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="h-[74px] w-full object-cover sm:h-[86px]"
        />
      </div>
      <div className="mt-1 truncate text-center text-[10px] uppercase tracking-[0.14em] text-cyan-100 sm:text-xs">
        {playerName || 'Player'}
      </div>
    </div>
  );
});
