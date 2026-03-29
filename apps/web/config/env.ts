export const webEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'MetaVerse2D',
  socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  rtcIceServerUrls:
    process.env.NEXT_PUBLIC_RTC_ICE_SERVER_URLS ?? 'stun:stun.l.google.com:19302',
  rtcIceServerUsername: process.env.NEXT_PUBLIC_RTC_ICE_SERVER_USERNAME ?? '',
  rtcIceServerCredential: process.env.NEXT_PUBLIC_RTC_ICE_SERVER_CREDENTIAL ?? '',
} as const;
