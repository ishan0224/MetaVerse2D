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
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

class RTCManager {
  private localStream: MediaStream | null = null;
  private readonly peerConnections = new Map<string, RTCPeerConnection>();
  private readonly remoteAudioElements = new Map<string, HTMLAudioElement>();
  private readonly pendingIceCandidates = new Map<string, WebRTCIceCandidate[]>();
  private readonly unsubscribers: Array<() => void> = [];
  private initialized = false;

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

    this.pendingIceCandidates.delete(targetId);
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
    return this.localStream;
  }

  private attachRemoteAudioStream(targetId: string, stream: MediaStream): void {
    const existingAudio = this.remoteAudioElements.get(targetId);
    if (existingAudio) {
      existingAudio.srcObject = stream;
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
    document.body.appendChild(audioElement);

    void audioElement.play().catch(() => {
      return;
    });

    this.remoteAudioElements.set(targetId, audioElement);
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

const rtcManager = new RTCManager();

export function getRTCManager(): RTCManager {
  return rtcManager;
}
