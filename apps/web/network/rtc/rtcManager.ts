import { webEnv } from '@/config/env';
import {
  onWebRTCAnswer,
  onWebRTCIceCandidate,
  onWebRTCOffer,
  sendWebRTCAnswer,
  sendWebRTCIceCandidate,
  sendWebRTCOffer,
} from '@/network';
import type { WebRTCIceCandidate, WebRTCSessionDescription } from '@/network/socket/socketClient';

export type RemotePeerMediaState = {
  peerId: string;
  stream: MediaStream;
  hasAudio: boolean;
  hasVideo: boolean;
  updatedAt: number;
};

const VIDEO_CONSTRAINTS = {
  width: { ideal: 320, max: 640 },
  height: { ideal: 180, max: 360 },
  frameRate: { ideal: 15, max: 20 },
};

const RTC_CONFIG = {
  iceServers: buildIceServers(),
};

const DISCONNECTED_TIMEOUT_MS = 5000;
const ICE_RESTART_COOLDOWN_MS = 2000;
const VIDEO_MAX_BITRATE_BPS = 250_000;
const VIDEO_MAX_FRAMERATE = 15;

class RTCManager {
  private localStream: MediaStream | null = null;
  private readonly peerConnections = new Map<string, RTCPeerConnection>();
  private readonly remoteAudioElements = new Map<string, HTMLAudioElement>();
  private readonly remoteAudioVolumes = new Map<string, number>();
  private readonly remoteAudioMuted = new Map<string, boolean>();
  private readonly remoteStreams = new Map<string, MediaStream>();
  private readonly remotePeerMedia = new Map<string, RemotePeerMediaState>();
  private readonly remotePeerMediaUnsubscribers = new Map<string, () => void>();
  private remotePeerMediaSnapshot: RemotePeerMediaState[] = [];
  private readonly pendingIceCandidates = new Map<string, WebRTCIceCandidate[]>();
  private readonly renegotiationLocks = new Set<string>();
  private readonly pendingRenegotiationByPeerId = new Set<string>();
  private readonly signalingTaskByPeerId = new Map<string, Promise<void>>();
  private readonly lastRecoveryAtMsByPeerId = new Map<string, number>();
  private readonly disconnectedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastIceRestartAtMsByPeerId = new Map<string, number>();
  private readonly remotePeerMediaListeners = new Set<() => void>();
  private readonly unsubscribers: Array<() => void> = [];
  private initialized = false;
  private localMicEnabled = false;
  private localCameraEnabled = false;
  private desiredLocalCameraEnabled = false;
  private cameraTransitionInFlight = false;
  private cameraTransitionRequested = false;

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.unsubscribers.push(
      onWebRTCOffer(({ fromId, offer }) => {
        void this.handleOffer(offer, fromId);
      }),
    );
    this.unsubscribers.push(
      onWebRTCAnswer(({ fromId, answer }) => {
        void this.handleAnswer(answer, fromId);
      }),
    );
    this.unsubscribers.push(
      onWebRTCIceCandidate(({ fromId, candidate }) => {
        void this.handleIceCandidate(candidate, fromId);
      }),
    );
    this.initialized = true;
  }

  public subscribeToRemotePeerMedia(listener: () => void): () => void {
    this.remotePeerMediaListeners.add(listener);
    return () => {
      this.remotePeerMediaListeners.delete(listener);
    };
  }

  public getRemotePeerMediaSnapshot(): RemotePeerMediaState[] {
    return this.remotePeerMediaSnapshot;
  }

  public hasCameraTrack(): boolean {
    return Boolean(this.localStream?.getVideoTracks()[0]);
  }

  public async createConnection(targetId: string): Promise<void> {
    const existingConnection = this.peerConnections.get(targetId);
    if (existingConnection && this.hasActiveConnection(targetId)) {
      return;
    }

    if (existingConnection && shouldRecreateConnection(existingConnection)) {
      this.closeConnection(targetId);
    }

    const connection = await this.getOrCreatePeerConnection(targetId);
    await this.renegotiateConnection(targetId, connection);
  }

  public hasActiveConnection(targetId: string): boolean {
    const connection = this.peerConnections.get(targetId);
    if (!connection) {
      return false;
    }

    if (connection.signalingState === 'closed') {
      return false;
    }

    if (connection.connectionState === 'closed' || connection.connectionState === 'failed') {
      return false;
    }

    return true;
  }

  public async handleOffer(offer: WebRTCSessionDescription, fromId: string): Promise<void> {
    await this.runSignalingTask(fromId, async () => {
      const connection = await this.getOrCreatePeerConnection(fromId);

      try {
        if (connection.signalingState === 'have-local-offer') {
          await connection.setLocalDescription({ type: 'rollback' });
        } else if (connection.signalingState !== 'stable') {
          return;
        }

        await connection.setRemoteDescription(new RTCSessionDescription(offer));
        await this.flushPendingIceCandidates(fromId, connection);

        if (!isHaveRemoteOfferState(connection)) {
          return;
        }

        const answer = await connection.createAnswer();
        if (!isHaveRemoteOfferState(connection)) {
          return;
        }

        await connection.setLocalDescription(answer);
        if (connection.localDescription?.type !== 'answer') {
          return;
        }

        sendWebRTCAnswer(fromId, answer);
      } catch (error) {
        if (isRecoverableRemoteDescriptionError(error)) {
          await this.recoverFromMLineMismatch(fromId, offer);
          return;
        }

        if (isInvalidStateError(error)) {
          return;
        }

        throw error;
      }
    });
  }

  public async handleAnswer(answer: WebRTCSessionDescription, fromId: string): Promise<void> {
    await this.runSignalingTask(fromId, async () => {
      const connection = this.peerConnections.get(fromId);
      if (!connection) {
        return;
      }

      if (connection.signalingState !== 'have-local-offer') {
        return;
      }

      try {
        await connection.setRemoteDescription(new RTCSessionDescription(answer));
        await this.flushPendingIceCandidates(fromId, connection);
      } catch (error) {
        if (isRecoverableRemoteDescriptionError(error)) {
          await this.recoverFromAnswerMLineMismatch(fromId);
          return;
        }

        if (isInvalidStateError(error)) {
          return;
        }

        throw error;
      }
    });
  }

  public async handleIceCandidate(candidate: WebRTCIceCandidate, fromId: string): Promise<void> {
    const connection = this.peerConnections.get(fromId);
    if (!connection) {
      this.queueIceCandidate(fromId, candidate);
      return;
    }

    if (!connection.remoteDescription) {
      this.queueIceCandidate(fromId, candidate);
      return;
    }

    try {
      await connection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      this.queueIceCandidate(fromId, candidate);
    }
  }

  public closeConnection(targetId: string): void {
    const connection = this.peerConnections.get(targetId);
    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.onsignalingstatechange = null;
      connection.onnegotiationneeded = null;
      connection.close();
      this.peerConnections.delete(targetId);
    }

    const remoteAudio = this.remoteAudioElements.get(targetId);
    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      this.remoteAudioElements.delete(targetId);
    }

    this.remoteAudioVolumes.delete(targetId);
    this.remoteAudioMuted.delete(targetId);
    this.remoteStreams.delete(targetId);
    this.pendingIceCandidates.delete(targetId);
    this.renegotiationLocks.delete(targetId);
    this.pendingRenegotiationByPeerId.delete(targetId);
    this.signalingTaskByPeerId.delete(targetId);
    this.lastRecoveryAtMsByPeerId.delete(targetId);
    this.lastIceRestartAtMsByPeerId.delete(targetId);
    this.clearDisconnectedTimer(targetId);
    this.detachRemotePeerMediaListeners(targetId);

    if (this.remotePeerMedia.delete(targetId)) {
      this.refreshRemotePeerMediaSnapshot();
      this.emitRemotePeerMedia();
    }
  }

  public setLocalMicEnabled(enabled: boolean): void {
    this.localMicEnabled = enabled;
    if (!this.localStream) {
      return;
    }

    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = enabled;
    }
  }

  public setLocalCameraEnabled(enabled: boolean): void {
    this.desiredLocalCameraEnabled = enabled;
    this.requestCameraTransition();
  }

  public setPeerVolume(targetId: string, volume: number): void {
    const clampedVolume = clamp(volume, 0, 1);
    const previousVolume = this.remoteAudioVolumes.get(targetId);
    if (typeof previousVolume === 'number' && Math.abs(previousVolume - clampedVolume) < 0.01) {
      return;
    }

    this.remoteAudioVolumes.set(targetId, clampedVolume);
    const audio = this.remoteAudioElements.get(targetId);
    if (!audio) {
      return;
    }

    audio.volume = clampedVolume;
  }

  public setPeerMuted(targetId: string, muted: boolean): void {
    const previousMuted = this.remoteAudioMuted.get(targetId);
    if (previousMuted === muted) {
      return;
    }

    this.remoteAudioMuted.set(targetId, muted);
    const audio = this.remoteAudioElements.get(targetId);
    if (!audio) {
      return;
    }

    audio.muted = muted;
  }

  public async requestMicrophoneAccess(): Promise<'granted' | 'blocked'> {
    try {
      await this.ensureLocalAudioTrack();
      return 'granted';
    } catch {
      this.detachAndStopLocalAudioTracks();
      return 'blocked';
    }
  }

  public async requestCameraAccess(): Promise<'granted' | 'blocked'> {
    try {
      await this.ensureLocalVideoTrack();
      return 'granted';
    } catch {
      this.detachAndStopLocalVideoTracks();
      this.setLocalCameraEnabled(false);
      return 'blocked';
    }
  }

  public destroy(): void {
    for (const targetId of this.peerConnections.keys()) {
      this.closeConnection(targetId);
    }

    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    this.initialized = false;

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    this.pendingIceCandidates.clear();
    this.remoteStreams.clear();

    for (const [, audioElement] of this.remoteAudioElements) {
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.remove();
    }
    this.remoteAudioElements.clear();
    this.remoteAudioVolumes.clear();
    this.remoteAudioMuted.clear();

    this.remotePeerMedia.clear();
    this.remotePeerMediaSnapshot = [];
    for (const targetId of this.remotePeerMediaUnsubscribers.keys()) {
      this.detachRemotePeerMediaListeners(targetId);
    }
    this.remotePeerMediaListeners.clear();
    this.renegotiationLocks.clear();
    this.pendingRenegotiationByPeerId.clear();
    this.signalingTaskByPeerId.clear();
    this.lastRecoveryAtMsByPeerId.clear();
    this.lastIceRestartAtMsByPeerId.clear();
    for (const timer of this.disconnectedTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectedTimers.clear();
    this.localMicEnabled = false;
    this.localCameraEnabled = false;
    this.desiredLocalCameraEnabled = false;
    this.cameraTransitionInFlight = false;
    this.cameraTransitionRequested = false;
  }

  private async getOrCreatePeerConnection(targetId: string): Promise<RTCPeerConnection> {
    const existingConnection = this.peerConnections.get(targetId);
    if (existingConnection) {
      return existingConnection;
    }

    const connection = new RTCPeerConnection(RTC_CONFIG);
    const localStream = this.localStream;
    const audioTransceiver = connection.addTransceiver('audio', { direction: 'recvonly' });
    const videoTransceiver = connection.addTransceiver('video', { direction: 'recvonly' });

    const localAudioTrack = localStream?.getAudioTracks()[0] ?? null;
    if (localAudioTrack) {
      await tryReplaceSenderTrack(audioTransceiver.sender, localAudioTrack);
      audioTransceiver.direction = 'sendrecv';
    }

    if (this.desiredLocalCameraEnabled) {
      const localVideoTrack =
        localStream?.getVideoTracks()[0] ?? (await this.ensureLocalVideoTrack().catch(() => null));
      if (localVideoTrack) {
        await tryReplaceSenderTrack(videoTransceiver.sender, localVideoTrack);
        videoTransceiver.direction = 'sendrecv';
        await applyVideoBitrateLimit(videoTransceiver.sender);
      }
    }

    connection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      sendWebRTCIceCandidate(targetId, event.candidate.toJSON());
    };

    connection.ontrack = (event) => {
      const remoteStream = this.getOrCreateRemoteStream(targetId, event);
      this.attachRemoteAudioStream(targetId, remoteStream);
      this.upsertRemotePeerMedia(targetId, remoteStream);
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'closed') {
        this.clearDisconnectedTimer(targetId);
        this.closeConnection(targetId);
        return;
      }

      if (connection.connectionState === 'failed') {
        this.clearDisconnectedTimer(targetId);
        this.attemptIceRestart(targetId, connection);
        return;
      }

      if (connection.connectionState === 'disconnected') {
        if (this.disconnectedTimers.has(targetId)) {
          return;
        }

        const timer = setTimeout(() => {
          this.disconnectedTimers.delete(targetId);
          const current = this.peerConnections.get(targetId);
          if (current !== connection) {
            return;
          }

          if (
            connection.connectionState === 'disconnected' ||
            connection.connectionState === 'failed'
          ) {
            this.closeConnection(targetId);
          }
        }, DISCONNECTED_TIMEOUT_MS);
        this.disconnectedTimers.set(targetId, timer);
        return;
      }

      if (connection.connectionState === 'connected') {
        this.clearDisconnectedTimer(targetId);
      }
    };

    connection.onsignalingstatechange = () => {
      if (connection.signalingState !== 'stable') {
        return;
      }

      void this.flushPendingRenegotiation(targetId, connection);
    };

    connection.onnegotiationneeded = () => {
      void this.renegotiateConnection(targetId, connection);
    };

    this.peerConnections.set(targetId, connection);
    return connection;
  }

  private async renegotiateConnection(
    targetId: string,
    connection: RTCPeerConnection,
  ): Promise<void> {
    await this.runSignalingTask(targetId, async () => {
      await this.createAndSendOffer(targetId, connection);
    });
  }

  private async createAndSendOffer(
    targetId: string,
    connection: RTCPeerConnection,
  ): Promise<void> {
    if (this.renegotiationLocks.has(targetId)) {
      this.pendingRenegotiationByPeerId.add(targetId);
      return;
    }

    if (connection.signalingState !== 'stable') {
      this.pendingRenegotiationByPeerId.add(targetId);
      return;
    }

    this.renegotiationLocks.add(targetId);
    try {
      const offer = await connection.createOffer();
      if (connection.signalingState !== 'stable') {
        return;
      }

      try {
        await connection.setLocalDescription(offer);
      } catch (error) {
        if (isInvalidStateError(error)) {
          return;
        }

        throw error;
      }

      if (connection.localDescription?.type !== 'offer') {
        return;
      }

      sendWebRTCOffer(targetId, offer);
    } finally {
      this.renegotiationLocks.delete(targetId);
      await this.flushPendingRenegotiation(targetId, connection);
    }
  }

  private async recoverFromMLineMismatch(
    fromId: string,
    offer: WebRTCSessionDescription,
  ): Promise<void> {
    if (!this.canRecoverPeerConnection(fromId)) {
      return;
    }

    this.closeConnection(fromId);
    const connection = await this.getOrCreatePeerConnection(fromId);

    try {
      await connection.setRemoteDescription(new RTCSessionDescription(offer));
      await this.flushPendingIceCandidates(fromId, connection);
      if (!isHaveRemoteOfferState(connection)) {
        return;
      }

      const answer = await connection.createAnswer();
      if (!isHaveRemoteOfferState(connection)) {
        return;
      }

      await connection.setLocalDescription(answer);
      if (connection.localDescription?.type !== 'answer') {
        return;
      }

      sendWebRTCAnswer(fromId, answer);
    } catch (error) {
      if (isInvalidStateError(error) || isRecoverableRemoteDescriptionError(error)) {
        return;
      }

      throw error;
    }
  }

  private async recoverFromAnswerMLineMismatch(fromId: string): Promise<void> {
    if (!this.canRecoverPeerConnection(fromId)) {
      return;
    }

    this.closeConnection(fromId);
    const connection = await this.getOrCreatePeerConnection(fromId);
    await this.safeRenegotiateConnection(fromId, connection);
  }

  private canRecoverPeerConnection(peerId: string): boolean {
    const nowMs = Date.now();
    const previousRecoveryAtMs = this.lastRecoveryAtMsByPeerId.get(peerId) ?? 0;
    if (nowMs - previousRecoveryAtMs < 1000) {
      return false;
    }

    this.lastRecoveryAtMsByPeerId.set(peerId, nowMs);
    return true;
  }

  private async runSignalingTask(targetId: string, task: () => Promise<void>): Promise<void> {
    const previousTask = this.signalingTaskByPeerId.get(targetId) ?? Promise.resolve();
    const queuedTask = previousTask.catch(noop).then(task);
    this.signalingTaskByPeerId.set(targetId, queuedTask);

    try {
      await queuedTask;
    } finally {
      if (this.signalingTaskByPeerId.get(targetId) === queuedTask) {
        this.signalingTaskByPeerId.delete(targetId);
      }
    }
  }

  private async flushPendingRenegotiation(
    targetId: string,
    connection: RTCPeerConnection,
  ): Promise<void> {
    if (!this.pendingRenegotiationByPeerId.has(targetId)) {
      return;
    }

    if (this.renegotiationLocks.has(targetId)) {
      return;
    }

    if (connection.signalingState !== 'stable') {
      return;
    }

    this.pendingRenegotiationByPeerId.delete(targetId);
    await this.renegotiateConnection(targetId, connection);
  }

  private ensureLocalStreamContainer(): MediaStream {
    if (this.localStream) {
      return this.localStream;
    }

    this.localStream = new MediaStream();
    return this.localStream;
  }

  private async ensureLocalAudioTrack(): Promise<MediaStreamTrack> {
    const existing = this.localStream?.getAudioTracks()[0];
    if (existing) {
      existing.enabled = this.localMicEnabled;
      return existing;
    }

    const captureStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const [audioTrack] = captureStream.getAudioTracks();
    if (!audioTrack) {
      throw new Error('audio track unavailable');
    }

    const localStream = this.ensureLocalStreamContainer();
    localStream.addTrack(audioTrack);
    audioTrack.enabled = this.localMicEnabled;

    for (const [peerId, connection] of this.peerConnections) {
      if (!isActivePeerConnection(this.peerConnections, peerId, connection)) {
        continue;
      }

      const audioContext = this.ensureSenderContextByKind(connection, 'audio');
      const hadTrack = Boolean(audioContext.sender.track);
      const replaced = await tryReplaceSenderTrack(audioContext.sender, audioTrack);
      if (!replaced) {
        continue;
      }

      let shouldRenegotiate = !hadTrack;
      if (!isSendingDirection(audioContext.transceiver.direction)) {
        audioContext.transceiver.direction = 'sendrecv';
        shouldRenegotiate = true;
      }

      if (shouldRenegotiate) {
        await this.safeRenegotiateConnection(peerId, connection);
      }
    }

    return audioTrack;
  }

  private async ensureLocalVideoTrack(): Promise<MediaStreamTrack> {
    const existing = this.localStream?.getVideoTracks()[0];
    if (existing) {
      existing.enabled = true;
      return existing;
    }

    const captureStream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
    const [videoTrack] = captureStream.getVideoTracks();
    if (!videoTrack) {
      throw new Error('video track unavailable');
    }

    const localStream = this.ensureLocalStreamContainer();
    localStream.addTrack(videoTrack);
    videoTrack.enabled = true;
    return videoTrack;
  }

  private async applyLocalCameraStateToPeers(): Promise<void> {
    const targetCameraEnabled = this.desiredLocalCameraEnabled;
    const localVideoTrack = this.localStream?.getVideoTracks()[0] ?? null;
    if (localVideoTrack) {
      localVideoTrack.enabled = targetCameraEnabled;
    }

    const peersNeedingRenegotiation: Array<{ peerId: string; connection: RTCPeerConnection; sender: RTCRtpSender }> = [];

    for (const [peerId, connection] of this.peerConnections) {
      if (!isActivePeerConnection(this.peerConnections, peerId, connection)) {
        continue;
      }

      const videoContext = this.ensureSenderContextByKind(connection, 'video');
      const existingVideoSender = videoContext.sender;
      if (!targetCameraEnabled) {
        let shouldRenegotiate = false;
        if (existingVideoSender?.track) {
          const replaced = await tryReplaceSenderTrack(existingVideoSender, null);
          shouldRenegotiate = shouldRenegotiate || replaced;
        }

        if (isSendingDirection(videoContext.transceiver.direction)) {
          videoContext.transceiver.direction = 'recvonly';
          shouldRenegotiate = true;
        }

        if (shouldRenegotiate) {
          peersNeedingRenegotiation.push({ peerId, connection, sender: existingVideoSender });
        }
        continue;
      }

      const ensuredVideoTrack = localVideoTrack ?? (await this.ensureLocalVideoTrack().catch(() => null));
      if (!ensuredVideoTrack) {
        continue;
      }

      const hadTrack = Boolean(existingVideoSender.track);
      const replaced = await tryReplaceSenderTrack(existingVideoSender, ensuredVideoTrack);
      if (!replaced) {
        continue;
      }

      let shouldRenegotiate = !hadTrack;
      if (!isSendingDirection(videoContext.transceiver.direction)) {
        videoContext.transceiver.direction = 'sendrecv';
        shouldRenegotiate = true;
      }

      if (shouldRenegotiate) {
        peersNeedingRenegotiation.push({ peerId, connection, sender: existingVideoSender });
      } else {
        await applyVideoBitrateLimit(existingVideoSender);
      }
    }

    for (let i = 0; i < peersNeedingRenegotiation.length; i++) {
      const { peerId, connection, sender } = peersNeedingRenegotiation[i];
      if (!isActivePeerConnection(this.peerConnections, peerId, connection)) {
        continue;
      }

      await this.safeRenegotiateConnection(peerId, connection);
      if (targetCameraEnabled) {
        await applyVideoBitrateLimit(sender);
      }

      if (i < peersNeedingRenegotiation.length - 1) {
        await delay(100);
      }
    }

    this.localCameraEnabled = targetCameraEnabled;

    if (!targetCameraEnabled) {
      this.detachAndStopLocalVideoTracks();
    }
  }

  private async safeRenegotiateConnection(
    targetId: string,
    connection: RTCPeerConnection,
  ): Promise<void> {
    if (!isActivePeerConnection(this.peerConnections, targetId, connection)) {
      return;
    }

    await this.renegotiateConnection(targetId, connection);
  }

  private clearDisconnectedTimer(targetId: string): void {
    const timer = this.disconnectedTimers.get(targetId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectedTimers.delete(targetId);
    }
  }

  private attemptIceRestart(targetId: string, connection: RTCPeerConnection): void {
    if (!isActivePeerConnection(this.peerConnections, targetId, connection)) {
      this.closeConnection(targetId);
      return;
    }

    const nowMs = Date.now();
    const lastRestartAtMs = this.lastIceRestartAtMsByPeerId.get(targetId) ?? 0;
    if (nowMs - lastRestartAtMs < ICE_RESTART_COOLDOWN_MS) {
      this.closeConnection(targetId);
      return;
    }

    this.lastIceRestartAtMsByPeerId.set(targetId, nowMs);
    connection.restartIce();
    void this.safeRenegotiateConnection(targetId, connection).catch(() => {
      this.closeConnection(targetId);
    });
  }

  private requestCameraTransition(): void {
    this.cameraTransitionRequested = true;
    if (this.cameraTransitionInFlight) {
      return;
    }

    this.cameraTransitionInFlight = true;
    void this.runCameraTransitionLoop();
  }

  private async runCameraTransitionLoop(): Promise<void> {
    try {
      while (this.cameraTransitionRequested || this.localCameraEnabled !== this.desiredLocalCameraEnabled) {
        this.cameraTransitionRequested = false;
        await this.applyLocalCameraStateToPeers();
      }
    } catch (error) {
      if (isInvalidStateError(error)) {
        return;
      }

      throw error;
    } finally {
      this.cameraTransitionInFlight = false;
      if (this.cameraTransitionRequested || this.localCameraEnabled !== this.desiredLocalCameraEnabled) {
        this.requestCameraTransition();
      }
    }
  }

  private ensureSenderContextByKind(
    connection: RTCPeerConnection,
    kind: 'audio' | 'video',
  ): { sender: RTCRtpSender; transceiver: RTCRtpTransceiver } {
    const existing = getSenderContextByKind(connection, kind);
    if (existing?.transceiver) {
      return {
        sender: existing.sender,
        transceiver: existing.transceiver,
      };
    }

    const transceiver = connection.addTransceiver(kind, { direction: 'recvonly' });
    return {
      sender: transceiver.sender,
      transceiver,
    };
  }

  private detachAndStopLocalAudioTracks(): void {
    if (!this.localStream) {
      return;
    }

    for (const track of this.localStream.getAudioTracks()) {
      this.localStream.removeTrack(track);
      track.stop();
    }

    if (this.localStream.getTracks().length === 0) {
      this.localStream = null;
    }
  }

  private detachAndStopLocalVideoTracks(): void {
    if (!this.localStream) {
      return;
    }

    for (const track of this.localStream.getVideoTracks()) {
      this.localStream.removeTrack(track);
      track.stop();
    }

    if (this.localStream.getTracks().length === 0) {
      this.localStream = null;
    }
  }

  private attachRemoteAudioStream(targetId: string, stream: MediaStream): void {
    if (stream.getAudioTracks().length === 0) {
      return;
    }

    const existingAudio = this.remoteAudioElements.get(targetId);
    if (existingAudio) {
      existingAudio.srcObject = stream;
      existingAudio.volume = this.remoteAudioVolumes.get(targetId) ?? 1;
      existingAudio.muted = this.remoteAudioMuted.get(targetId) ?? false;
      void existingAudio.play().catch(() => {
        return;
      });
      return;
    }

    const audioElement = document.createElement('audio');
    audioElement.autoplay = true;
    audioElement.setAttribute('playsinline', 'true');
    audioElement.srcObject = stream;
    audioElement.style.display = 'none';
    audioElement.volume = this.remoteAudioVolumes.get(targetId) ?? 1;
    audioElement.muted = this.remoteAudioMuted.get(targetId) ?? false;
    document.body.appendChild(audioElement);

    void audioElement.play().catch(() => {
      return;
    });

    this.remoteAudioElements.set(targetId, audioElement);
  }

  private getOrCreateRemoteStream(targetId: string, event: RTCTrackEvent): MediaStream {
    const [streamFromEvent] = event.streams;
    if (streamFromEvent) {
      this.remoteStreams.set(targetId, streamFromEvent);
      return streamFromEvent;
    }

    const existingStream =
      this.remoteStreams.get(targetId) ?? this.remotePeerMedia.get(targetId)?.stream ?? new MediaStream();
    if (!existingStream.getTracks().some((track) => track.id === event.track.id)) {
      existingStream.addTrack(event.track);
      const removeTrackOnEnd = () => {
        existingStream.removeTrack(event.track);
        this.upsertRemotePeerMedia(targetId, existingStream);
        event.track.removeEventListener('ended', removeTrackOnEnd);
      };
      event.track.addEventListener('ended', removeTrackOnEnd);
    }

    this.remoteStreams.set(targetId, existingStream);
    return existingStream;
  }

  private upsertRemotePeerMedia(targetId: string, stream: MediaStream): void {
    const previous = this.remotePeerMedia.get(targetId);
    if (!previous || previous.stream !== stream) {
      this.attachRemotePeerMediaListeners(targetId, stream);
    }

    this.remotePeerMedia.set(targetId, {
      peerId: targetId,
      stream,
      hasAudio: hasLiveTrack(stream, 'audio'),
      hasVideo: hasLiveTrack(stream, 'video'),
      updatedAt: Date.now(),
    });
    this.refreshRemotePeerMediaSnapshot();
    this.emitRemotePeerMedia();
  }

  private attachRemotePeerMediaListeners(targetId: string, stream: MediaStream): void {
    this.detachRemotePeerMediaListeners(targetId);

    const trackUnsubscribers = new Map<MediaStreamTrack, () => void>();
    const syncTrackListeners = () => {
      const tracks = stream.getTracks();
      for (const track of tracks) {
        if (trackUnsubscribers.has(track)) {
          continue;
        }

        const onTrackStateChange = () => {
          this.upsertRemotePeerMedia(targetId, stream);
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

      for (const [tracked, unsubscribe] of trackUnsubscribers) {
        if (tracks.includes(tracked)) {
          continue;
        }

        unsubscribe();
        trackUnsubscribers.delete(tracked);
      }
    };

    const onStreamTrackChange = () => {
      syncTrackListeners();
      this.upsertRemotePeerMedia(targetId, stream);
    };

    stream.addEventListener('addtrack', onStreamTrackChange);
    stream.addEventListener('removetrack', onStreamTrackChange);
    syncTrackListeners();

    this.remotePeerMediaUnsubscribers.set(targetId, () => {
      stream.removeEventListener('addtrack', onStreamTrackChange);
      stream.removeEventListener('removetrack', onStreamTrackChange);
      for (const unsubscribe of trackUnsubscribers.values()) {
        unsubscribe();
      }
      trackUnsubscribers.clear();
    });
  }

  private detachRemotePeerMediaListeners(targetId: string): void {
    const unsubscribe = this.remotePeerMediaUnsubscribers.get(targetId);
    if (!unsubscribe) {
      return;
    }

    unsubscribe();
    this.remotePeerMediaUnsubscribers.delete(targetId);
  }

  private refreshRemotePeerMediaSnapshot(): void {
    this.remotePeerMediaSnapshot = Array.from(this.remotePeerMedia.values()).sort((left, right) =>
      left.peerId.localeCompare(right.peerId),
    );
  }

  private emitRemotePeerMedia(): void {
    for (const listener of this.remotePeerMediaListeners) {
      listener();
    }
  }

  private queueIceCandidate(fromId: string, candidate: WebRTCIceCandidate): void {
    const queued = this.pendingIceCandidates.get(fromId);
    if (queued) {
      queued.push(candidate);
      return;
    }

    this.pendingIceCandidates.set(fromId, [candidate]);
  }

  private async flushPendingIceCandidates(
    fromId: string,
    connection: RTCPeerConnection,
  ): Promise<void> {
    if (!connection.remoteDescription) {
      return;
    }

    const queued = this.pendingIceCandidates.get(fromId);
    if (!queued || queued.length === 0) {
      return;
    }

    this.pendingIceCandidates.delete(fromId);

    for (const candidate of queued) {
      try {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        continue;
      }
    }
  }
}

function buildIceServers(): Array<{
  urls: string[] | string;
  username?: string;
  credential?: string;
}> {
  const configuredUrls = webEnv.rtcIceServerUrls
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const fallbackUrls = configuredUrls.length > 0 ? configuredUrls : ['stun:stun.l.google.com:19302'];

  const primary: {
    urls: string[] | string;
    username?: string;
    credential?: string;
  } = {
    urls: fallbackUrls,
  };
  const username = webEnv.rtcIceServerUsername.trim();
  const credential = webEnv.rtcIceServerCredential.trim();
  if (username && credential) {
    primary.username = username;
    primary.credential = credential;
  }

  return [primary];
}

function getSendingSenderByKind(
  connection: RTCPeerConnection,
  kind: 'audio' | 'video',
): RTCRtpSender | null {
  for (const sender of connection.getSenders()) {
    if (sender.track?.kind === kind) {
      return sender;
    }
  }

  return null;
}

function getSenderContextByKind(
  connection: RTCPeerConnection,
  kind: 'audio' | 'video',
): { sender: RTCRtpSender; transceiver: RTCRtpTransceiver | null } | null {
  for (const transceiver of connection.getTransceivers()) {
    if (transceiver.sender.track?.kind === kind || transceiver.receiver.track.kind === kind) {
      return {
        sender: transceiver.sender,
        transceiver,
      };
    }
  }

  const sender = getSendingSenderByKind(connection, kind);
  if (!sender) {
    return null;
  }

  return {
    sender,
    transceiver: null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isInvalidStateError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { name?: string; message?: string };
  if (maybeError.name === 'InvalidStateError') {
    return true;
  }

  if (typeof maybeError.message !== 'string') {
    return false;
  }

  const normalizedMessage = maybeError.message.toLowerCase();
  return normalizedMessage.includes('setlocaldescription') && normalizedMessage.includes('signalingstate');
}

function isMLineOrderError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { message?: string };
  if (typeof maybeError.message !== 'string') {
    return false;
  }

  return maybeError.message.toLowerCase().includes('order of m-lines');
}

function isSdpRoleError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeError = error as { message?: string };
  if (typeof maybeError.message !== 'string') {
    return false;
  }

  const normalized = maybeError.message.toLowerCase();
  return normalized.includes('set ssl role') || normalized.includes('dtls role');
}

function isRecoverableRemoteDescriptionError(error: unknown): boolean {
  return isMLineOrderError(error) || isSdpRoleError(error);
}

function hasLiveTrack(stream: MediaStream, kind: 'audio' | 'video'): boolean {
  for (const track of stream.getTracks()) {
    if (track.kind !== kind || track.readyState !== 'live') {
      continue;
    }

    if (kind === 'video') {
      return true;
    }

    if (!track.muted) {
      return true;
    }
  }

  return false;
}

function isHaveRemoteOfferState(connection: RTCPeerConnection): boolean {
  return connection.signalingState === 'have-remote-offer';
}

function isSendingDirection(direction: string): boolean {
  return direction === 'sendrecv' || direction === 'sendonly';
}

function shouldRecreateConnection(connection: RTCPeerConnection): boolean {
  return (
    connection.signalingState === 'closed' ||
    connection.connectionState === 'closed' ||
    connection.connectionState === 'failed'
  );
}

function isConnectionClosed(connection: RTCPeerConnection): boolean {
  return connection.signalingState === 'closed' || connection.connectionState === 'closed';
}

function isActivePeerConnection(
  peerConnections: ReadonlyMap<string, RTCPeerConnection>,
  peerId: string,
  connection: RTCPeerConnection,
): boolean {
  return peerConnections.get(peerId) === connection && !isConnectionClosed(connection);
}

async function tryReplaceSenderTrack(
  sender: RTCRtpSender,
  track: MediaStreamTrack | null,
): Promise<boolean> {
  try {
    await sender.replaceTrack(track);
    return true;
  } catch (error) {
    if (isInvalidStateError(error)) {
      return false;
    }

    throw error;
  }
}

async function applyVideoBitrateLimit(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    for (const encoding of params.encodings) {
      encoding.maxBitrate = VIDEO_MAX_BITRATE_BPS;
      encoding.maxFramerate = VIDEO_MAX_FRAMERATE;
    }

    await sender.setParameters(params);
  } catch {
    // Some browsers may not support setParameters — acceptable degradation.
  }
}

const rtcManager = new RTCManager();

export function getRTCManager(): RTCManager {
  return rtcManager;
}

function noop(): void {
  return;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
