export type RewardWheelProbabilityItem = {
  id: string;
  resolvedProbability?: number;
};

export type RewardWheelSegment<T extends RewardWheelProbabilityItem> = T & {
  probability: number;
  startAngle: number;
  endAngle: number;
  midpoint: number;
};

export function buildRewardWheelSegments<T extends RewardWheelProbabilityItem>(items: T[]): RewardWheelSegment<T>[] {
  const weights = items.map((item) => Math.max(0, Number(item.resolvedProbability ?? 0)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!items.length || total <= 0) return [];

  let cursor = 0;
  return items.map((item, index) => {
    const probability = weights[index] / total;
    const startAngle = cursor;
    const endAngle = index === items.length - 1 ? 360 : startAngle + probability * 360;
    cursor = endAngle;
    return {
      ...item,
      resolvedProbability: probability,
      probability,
      startAngle,
      endAngle,
      midpoint: startAngle + (endAngle - startAngle) / 2,
    };
  });
}

export function rewardWheelLandingRotation(currentRotation: number, segmentMidpoint: number, fullTurns = 6) {
  const normalizedCurrent = ((currentRotation % 360) + 360) % 360;
  const target = ((360 - segmentMidpoint) % 360 + 360) % 360;
  const forwardDelta = (target - normalizedCurrent + 360) % 360;
  return currentRotation + fullTurns * 360 + forwardDelta;
}
