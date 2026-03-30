import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('@/components/GameCanvas').then((mod) => mod.GameCanvas), {
  ssr: false,
  loading: () => (
    <div className="h-screen h-[100dvh] w-full bg-slate-950" aria-hidden="true" />
  ),
});

export default function HomePage() {
  return <GameCanvas />;
}
