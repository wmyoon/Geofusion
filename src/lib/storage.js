const STORAGE_KEY = 'geo-fusion-progress-v1';
const emptyDimension = () => ({
    attempts: 0,
    totalScore: 0,
    bestScore: 0,
});
export const createEmptyProgress = () => ({
    roundsPlayed: 0,
    totalQuestions: 0,
    bestRoundScore: 0,
    dimensions: {
        outline: emptyDimension(),
        location: emptyDimension(),
        capital: emptyDimension(),
        population: emptyDimension(),
        area: emptyDimension(),
        chineseName: emptyDimension(),
    },
    units: {},
});
const isDimension = (value) => ['outline', 'location', 'capital', 'population', 'area', 'chineseName'].includes(value);
export const loadProgress = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return createEmptyProgress();
        }
        const parsed = JSON.parse(raw);
        const progress = createEmptyProgress();
        progress.roundsPlayed = Number(parsed.roundsPlayed) || 0;
        progress.totalQuestions = Number(parsed.totalQuestions) || 0;
        progress.bestRoundScore = Number(parsed.bestRoundScore) || 0;
        for (const [key, value] of Object.entries(parsed.dimensions ?? {})) {
            if (!isDimension(key)) {
                continue;
            }
            progress.dimensions[key] = {
                attempts: Number(value.attempts) || 0,
                totalScore: Number(value.totalScore) || 0,
                bestScore: Number(value.bestScore) || 0,
            };
        }
        progress.units = parsed.units ?? {};
        return progress;
    }
    catch {
        return createEmptyProgress();
    }
};
export const saveProgress = (progress) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
};
export const applyRoundToProgress = (progress, questionUnitKeys, results) => {
    const next = {
        roundsPlayed: progress.roundsPlayed,
        totalQuestions: progress.totalQuestions,
        bestRoundScore: progress.bestRoundScore,
        dimensions: {
            outline: { ...progress.dimensions.outline },
            location: { ...progress.dimensions.location },
            capital: { ...progress.dimensions.capital },
            population: { ...progress.dimensions.population },
            area: { ...progress.dimensions.area },
            chineseName: { ...progress.dimensions.chineseName },
        },
        units: { ...progress.units },
    };
    const roundScore = results.reduce((sum, result) => sum + result.finalScore, 0) / Math.max(1, results.length);
    next.roundsPlayed += 1;
    next.totalQuestions += results.length;
    next.bestRoundScore = Math.max(next.bestRoundScore, roundScore);
    results.forEach((result) => {
        const bucket = next.dimensions[result.dimension];
        bucket.attempts += 1;
        bucket.totalScore += result.finalScore;
        bucket.bestScore = Math.max(bucket.bestScore, result.finalScore);
    });
    const perUnitScores = {};
    results.forEach((result, index) => {
        const unitKey = questionUnitKeys[index];
        if (!unitKey) {
            return;
        }
        if (!perUnitScores[unitKey]) {
            perUnitScores[unitKey] = [];
        }
        perUnitScores[unitKey].push(result.finalScore);
    });
    Object.entries(perUnitScores).forEach(([unitKey, scores]) => {
        const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const unit = next.units[unitKey] ?? {
            rounds: 0,
            totalScore: 0,
            bestScore: 0,
            lastScore: 0,
            lastPlayedAt: new Date().toISOString(),
        };
        unit.rounds += 1;
        unit.totalScore += average;
        unit.bestScore = Math.max(unit.bestScore, average);
        unit.lastScore = average;
        unit.lastPlayedAt = new Date().toISOString();
        next.units[unitKey] = unit;
    });
    return next;
};
