export type TimedPosition = {
  x: number;
  y: number;
  timestamp: number;
};

export function interpolatePosition(buffer: TimedPosition[], renderTime: number): TimedPosition | null {
  if (buffer.length === 0) {
    return null;
  }

  if (buffer.length === 1) {
    return { ...buffer[0] };
  }

  const first = buffer[0];
  if (renderTime <= first.timestamp) {
    return { ...first };
  }

  const last = buffer[buffer.length - 1];
  if (renderTime >= last.timestamp) {
    return { ...last };
  }

  for (let index = 0; index < buffer.length - 1; index += 1) {
    const start = buffer[index];
    const end = buffer[index + 1];

    if (renderTime < start.timestamp || renderTime > end.timestamp) {
      continue;
    }

    const duration = end.timestamp - start.timestamp;
    if (duration <= 0) {
      return { ...end };
    }

    const alpha = (renderTime - start.timestamp) / duration;

    return {
      x: start.x + (end.x - start.x) * alpha,
      y: start.y + (end.y - start.y) * alpha,
      timestamp: renderTime,
    };
  }

  return { ...last };
}
