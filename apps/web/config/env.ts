export const webEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'MetaVerse2D',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000',
} as const;
