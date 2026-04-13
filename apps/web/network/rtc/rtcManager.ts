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

const RTC_CONFIG = {
  iceServers: webEnv.webrtcIceServers,
};

const VOICE_BAR_COUNT = 5;
const VOICE_FREQ_MIN_HZ = 80;
const VOICE_FREQ_MAX_HZ = 3000;
const VOICE_BAR_MIN_SCALE = 0.3;
const VOICE_BAR_MAX_SCALE = 2.5;
const VOICE_SIGNAL_THRESHOLD = 0.05;

export type VoiceActivitySample = {
  barScales: number[];
  hasSignal: boolean;
};

class StreamVoiceAnalyser {
  private readonly source: MediaStreamAudioSourceNode;
  private readonly analyser: AnalyserNode;
  private readonly frequencyData: Uint8Array<ArrayBuffer>;

  public constructor(audioContext: AudioContext, stream: MediaStream) {
    this.source = audioContext.createMediaStreamSource(stream);
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this.source.connect(this.analyser);
    this.frequencyData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
  }

  public sample(): VoiceActivitySample {
    this.analyser.getByteFrequencyData(this.frequencyData);

    const barScales: number[] = [];
    let normalizedSum = 0;
    for (let barIndex = 0; barIndex < VOICE_BAR_COUNT; barIndex += 1) {
      const bandStartHz =
        VOICE_FREQ_MIN_HZ + ((VOICE_FREQ_MAX_HZ - VOICE_FREQ_MIN_HZ) / VOICE_BAR_COUNT) * barIndex;
      const bandEndHz =
        VOICE_FREQ_MIN_HZ + ((VOICE_FREQ_MAX_HZ - VOICE_FREQ_MIN_HZ) / VOICE_BAR_COUNT) * (barIndex + 1);
      const averageAmplitude = this.getAverageAmplitudeInBand(bandStartHz, bandEndHz);
      const normalized = clamp(averageAmplitude / 255, 0, 1);
      normalizedSum += normalized;
      barScales.push(
        clamp(
          VOICE_BAR_MIN_SCALE + normalized * (VOICE_BAR_MAX_SCALE - VOICE_BAR_MIN_SCALE),
          VOICE_BAR_MIN_SCALE,
          VOICE_BAR_MAX_SCALE,
        ),
      );
    }

    const averageNormalizedLevel = normalizedSum / VOICE_BAR_COUNT;
    return {
      barScales,
      hasSignal: averageNormalizedLevel >= VOICE_SIGNAL_THRESHOLD,
    };
  }

  public destroy(): void {
    this.source.disconnect();
    this.analyser.disconnect();
  }

  private getAverageAmplitudeInBand(startHz: number, endHz: number): number {
    const sampleRate = this.analyser.context.sampleRate;
    const nyquist = sampleRate / 2;
    const frequencyBinWidth = nyquist / this.frequencyData.length;
    const startIndex = clamp(Math.floor(startHz / frequencyBinWidth), 0, this.frequencyData.length - 1);
    const endIndex = clamp(
      Math.ceil(endHz / frequencyBinWidth),
      startIndex + 1,
      this.frequencyData.length,
    );

    let sum = 0;
    let count = 0;
    for (let index = startIndex; index < endIndex; index += 1) {
      sum += this.frequencyData[index];
      count += 1;
    }

    if (count === 0) {
      return 0;
    }

    return sum / count;
  }
}

class RTCManager {
  private localStream: MediaStream | null = null;
  private readonly peerConnections = new Map<string, RTCPeerConnection>();
  private readonly remoteAudioElements = new Map<string, HTMLAudioElement>();
  private readonly remoteAudioVolumes = new Map<string, number>();
  private readonly remoteAudioMuted = new Map<string, boolean>();
  private readonly remoteVoiceAnalysers = new Map<string, StreamVoiceAnalyser>();
  private readonly pendingIceCandidates = new Map<string, WebRTCIceCandidate[]>();
  private readonly unsubscribers: Array<() => void> = [];
  private audioContext: AudioContext | null = null;
  private localVoiceAnalyser: StreamVoiceAnalyser | null = null;
  private initialized = false;
  private localMicEnabled = false;

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

  public async createConnection(targetId: string): Promise<void> {
    const connection = await this.getOrCreatePeerConnection(targetId);
    if (connection.signalingState !== 'stable') {
      return;
    }

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    sendWebRTCOffer(targetId, offer);
  }

  public async handleOffer(offer: WebRTCSessionDescription, fromId: string): Promise<void> {
    const connection = await this.getOrCreatePeerConnection(fromId);

    if (connection.signalingState === 'have-local-offer') {
      await connection.setLocalDescription({ type: 'rollback' });
    } else if (connection.signalingState !== 'stable') {
      return;
    }

    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates(fromId, connection);

    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    sendWebRTCAnswer(fromId, answer);
  }

  public async handleAnswer(answer: WebRTCSessionDescription, fromId: string): Promise<void> {
    const connection = this.peerConnections.get(fromId);
    if (!connection) {
      return;
    }

    if (connection.signalingState !== 'have-local-offer') {
      return;
    }

    await connection.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingIceCandidates(fromId, connection);
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
    const remoteVoiceAnalyser = this.remoteVoiceAnalysers.get(targetId);
    if (remoteVoiceAnalyser) {
      remoteVoiceAnalyser.destroy();
      this.remoteVoiceAnalysers.delete(targetId);
    }
    this.pendingIceCandidates.delete(targetId);
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

  public sampleLocalVoiceActivity(): VoiceActivitySample | null {
    if (!this.localVoiceAnalyser) {
      return null;
    }

    return this.localVoiceAnalyser.sample();
  }

  public samplePeerVoiceActivity(targetId: string): VoiceActivitySample | null {
    const analyser = this.remoteVoiceAnalysers.get(targetId);
    if (!analyser) {
      return null;
    }

    return analyser.sample();
  }

  public hasPeerAudioStream(targetId: string): boolean {
    return this.remoteAudioElements.has(targetId);
  }

  public hasLocalAudioStream(): boolean {
    return this.localStream !== null;
  }

  public async requestMicrophoneAccess(): Promise<'granted' | 'blocked'> {
    try {
      await this.ensureLocalStream();
      return 'granted';
    } catch {
      this.localStream = null;
      this.localVoiceAnalyser?.destroy();
      this.localVoiceAnalyser = null;
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

    this.localVoiceAnalyser?.destroy();
    this.localVoiceAnalyser = null;
    for (const remoteVoiceAnalyser of this.remoteVoiceAnalysers.values()) {
      remoteVoiceAnalyser.destroy();
    }
    this.remoteVoiceAnalysers.clear();

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {
        return;
      });
      this.audioContext = null;
    }

    this.pendingIceCandidates.clear();
  }

  private async getOrCreatePeerConnection(targetId: string): Promise<RTCPeerConnection> {
    const existingConnection = this.peerConnections.get(targetId);
    if (existingConnection) {
      return existingConnection;
    }

    const connection = new RTCPeerConnection(RTC_CONFIG);
    const localStream = await this.ensureLocalStream();

    for (const track of localStream.getTracks()) {
      connection.addTrack(track, localStream);
    }

    connection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      sendWebRTCIceCandidate(targetId, event.candidate.toJSON());
    };

    connection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) {
        return;
      }

      this.attachRemoteAudioStream(targetId, remoteStream);
    };

    connection.onconnectionstatechange = () => {
      if (
        connection.connectionState === 'closed' ||
        connection.connectionState === 'failed' ||
        connection.connectionState === 'disconnected'
      ) {
        this.closeConnection(targetId);
      }
    };

    this.peerConnections.set(targetId, connection);
    return connection;
  }

  private async ensureLocalStream(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = this.localMicEnabled;
    }
    this.attachLocalVoiceAnalyser(this.localStream);
    return this.localStream;
  }

  private attachRemoteAudioStream(targetId: string, stream: MediaStream): void {
    const existingAudio = this.remoteAudioElements.get(targetId);
    if (existingAudio) {
      existingAudio.srcObject = stream;
      existingAudio.volume = this.remoteAudioVolumes.get(targetId) ?? 1;
      existingAudio.muted = this.remoteAudioMuted.get(targetId) ?? false;
      this.attachRemoteVoiceAnalyser(targetId, stream);
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
    this.attachRemoteVoiceAnalyser(targetId, stream);
  }

  private attachLocalVoiceAnalyser(stream: MediaStream): void {
    this.localVoiceAnalyser?.destroy();
    this.localVoiceAnalyser = null;

    const audioContext = this.ensureAudioContext();
    if (!audioContext) {
      return;
    }

    this.localVoiceAnalyser = new StreamVoiceAnalyser(audioContext, stream);
  }

  private attachRemoteVoiceAnalyser(targetId: string, stream: MediaStream): void {
    const existingAnalyser = this.remoteVoiceAnalysers.get(targetId);
    if (existingAnalyser) {
      existingAnalyser.destroy();
      this.remoteVoiceAnalysers.delete(targetId);
    }

    const audioContext = this.ensureAudioContext();
    if (!audioContext) {
      return;
    }

    this.remoteVoiceAnalysers.set(targetId, new StreamVoiceAnalyser(audioContext, stream));
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
      return null;
    }

    if (!this.audioContext) {
      try {
        this.audioContext = new window.AudioContext();
      } catch {
        this.audioContext = null;
        return null;
      }
    }

    void this.audioContext.resume().catch(() => {
      return;
    });
    return this.audioContext;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const rtcManager = new RTCManager();

export function getRTCManager(): RTCManager {
  return rtcManager;
}
