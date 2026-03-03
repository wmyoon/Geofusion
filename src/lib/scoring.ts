type ScoreTier = {
  max: number;
  score: number;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const scoreFromTiers = (value: number, tiers: ScoreTier[]): number => {
  for (const tier of tiers) {
    if (value <= tier.max) {
      return tier.score;
    }
  }

  return 0;
};

export const scoreLocation = (
  distanceKm: number,
  options?: {
    smallRegion?: boolean;
  },
): number => {
  const fullCreditKm = options?.smallRegion ? 60 : 40;
  const zeroCreditKm = 250;

  if (distanceKm <= fullCreditKm) {
    return 100;
  }

  if (distanceKm >= zeroCreditKm) {
    return 0;
  }

  const score = 1 - (distanceKm - fullCreditKm) / (zeroCreditKm - fullCreditKm);
  return Math.round(clamp(score, 0, 1) * 100);
};

const sharedEstimateTiers: ScoreTier[] = [
  { max: 0.1, score: 100 },
  { max: 0.25, score: 75 },
  { max: 0.4, score: 50 },
  { max: 0.5, score: 30 },
];

export const scorePopulation = (relativeError: number): number =>
  scoreFromTiers(relativeError, sharedEstimateTiers);

export const scoreArea = (relativeError: number): number =>
  scoreFromTiers(relativeError, sharedEstimateTiers);
