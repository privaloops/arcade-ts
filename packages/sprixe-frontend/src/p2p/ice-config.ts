/**
 * Shared ICE server list used by both PeerHost and PeerSend.
 * Without it, PeerJS falls back to its Cloud defaults which are
 * rate-limited and unreachable on some corporate / cellular networks.
 */

export const DEFAULT_ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302"] },
  { urls: ["stun:stun.cloudflare.com:3478"] },
];
