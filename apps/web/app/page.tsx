import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('@/components/GameCanvas').then((mod) => mod.GameCanvas), {
  ssr: false,
});

export default function HomePage() {
  return <GameCanvas />;
}
