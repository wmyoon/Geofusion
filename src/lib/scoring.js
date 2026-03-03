const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const scoreFromTiers = (value, tiers) => {
    for (const tier of tiers) {
        if (value <= tier.max) {
            return tier.score;
        }
    }
    return 0;
};
export const scoreLocation = (distanceKm, options) => {
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
const sharedEstimateTiers = [
    { max: 0.1, score: 100 },
    { max: 0.25, score: 75 },
    { max: 0.4, score: 50 },
    { max: 0.5, score: 30 },
];
export const scorePopulation = (relativeError) => scoreFromTiers(relativeError, sharedEstimateTiers);
export const scoreArea = (relativeError) => scoreFromTiers(relativeError, sharedEstimateTiers);
