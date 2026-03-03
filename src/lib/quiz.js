import { distanceToGeometryKm, haversineDistanceKm, isPointInsideGeometry } from './geo';
import { scoreArea, scoreLocation, scorePopulation } from './scoring';
import { equalsAlias, formatCompact, formatNumber, parseHumanNumber, similarityScore } from './strings';
export const QUESTION_ORDER = ['outline', 'location', 'capital', 'population', 'area'];
const HINT_PENALTY = 15;
const scopeEntityLabel = (scope) => (scope === 'world' ? 'country' : 'province-level division');
export const dimensionLabel = (dimension) => {
    if (dimension === 'outline') {
        return 'Outline';
    }
    if (dimension === 'location') {
        return 'Location';
    }
    if (dimension === 'capital') {
        return 'Capital';
    }
    if (dimension === 'population') {
        return 'Population';
    }
    return 'Area';
};
export const questionPrompt = (dimension, unit, scope) => {
    if (dimension === 'outline') {
        return `Identify the ${scopeEntityLabel(scope)} from this outline.`;
    }
    if (dimension === 'location') {
        return `Tap where ${unit.name} is located.`;
    }
    if (dimension === 'capital') {
        return `What is the capital of ${unit.name}?`;
    }
    if (dimension === 'population') {
        return `Estimate ${unit.name}'s population (${unit.population.refDate}).`;
    }
    return `Estimate ${unit.name}'s area in km² (${unit.areaKm2.refDate}).`;
};
const magnitudeHint = (value, suffix) => {
    if (value <= 0) {
        return `Around 0 ${suffix}.`;
    }
    const exponent = Math.floor(Math.log10(value));
    const lower = 10 ** exponent;
    const upper = 10 ** (exponent + 1);
    return `Order of magnitude: ${formatCompact(lower)} to ${formatCompact(upper)} ${suffix}.`;
};
export const questionHint = (dimension, unit) => {
    if (dimension === 'outline' || dimension === 'location') {
        return `Region hint: ${unit.regionHint}.`;
    }
    if (dimension === 'capital') {
        return `Starts with "${unit.capitalPrimary[0]}", ${unit.capitalPrimary.length} characters.`;
    }
    if (dimension === 'population') {
        return magnitudeHint(unit.population.value, 'people');
    }
    return magnitudeHint(unit.areaKm2.value, 'km²');
};
const withPenalty = (score, hintUsed) => hintUsed ? Math.max(0, score - HINT_PENALTY) : score;
const textResult = (dimension, rawScore, hintUsed, guessLabel, answerLabel, feedback, isCorrect, detail) => ({
    dimension,
    rawScore,
    finalScore: withPenalty(rawScore, hintUsed),
    hintUsed,
    isCorrect,
    guessLabel,
    answerLabel,
    feedback,
    detail,
});
const acceptedUnitNames = (unit) => [
    unit.name,
    ...(unit.nameLocal ? [unit.nameLocal] : []),
    ...unit.aliases,
    unit.code,
];
const acceptedCapitalNames = (unit) => [
    unit.capitalPrimary,
    ...unit.capitalAliases,
];
export const evaluateOutlineTextQuestion = (unit, guessText, hintUsed) => {
    const trimmedGuess = guessText.trim();
    if (!trimmedGuess) {
        return null;
    }
    const options = acceptedUnitNames(unit);
    const isExact = equalsAlias(trimmedGuess, options);
    const bestSimilarity = Math.max(...options.map((value) => similarityScore(trimmedGuess, value)));
    const rawScore = isExact ? 100 : bestSimilarity >= 0.9 ? 70 : bestSimilarity >= 0.78 ? 40 : 0;
    return textResult('outline', rawScore, hintUsed, trimmedGuess, unit.name, isExact ? 'Correct outline match.' : rawScore > 0 ? 'Close, but not exact.' : 'Not a match this time.', isExact);
};
export const evaluateTextQuestion = (dimension, unit, guessText, hintUsed) => {
    const trimmedGuess = guessText.trim();
    if (!trimmedGuess) {
        return null;
    }
    if (dimension === 'capital') {
        const options = acceptedCapitalNames(unit);
        const isExact = equalsAlias(trimmedGuess, options);
        const bestSimilarity = Math.max(...options.map((value) => similarityScore(trimmedGuess, value)));
        const rawScore = isExact ? 100 : bestSimilarity >= 0.9 ? 80 : bestSimilarity >= 0.78 ? 50 : 0;
        return textResult('capital', rawScore, hintUsed, trimmedGuess, unit.capitalPrimary, isExact ? 'Correct capital.' : rawScore > 0 ? 'Close, but not an accepted alias.' : 'Incorrect capital guess.', isExact);
    }
    const parsed = parseHumanNumber(trimmedGuess);
    if (parsed === null || parsed <= 0) {
        return null;
    }
    if (dimension === 'population') {
        const actual = unit.population.value;
        const relativeError = Math.abs(parsed - actual) / actual;
        const rawScore = scorePopulation(relativeError);
        return textResult('population', rawScore, hintUsed, formatNumber(parsed), formatNumber(actual), rawScore >= 75 ? 'Strong population estimate.' : 'Population estimate was off.', rawScore >= 75, `Relative error: ${(relativeError * 100).toFixed(1)}%`);
    }
    const actual = unit.areaKm2.value;
    const relativeError = Math.abs(parsed - actual) / actual;
    const rawScore = scoreArea(relativeError);
    return textResult('area', rawScore, hintUsed, `${formatNumber(parsed)} km²`, `${formatNumber(actual)} km²`, rawScore >= 75 ? 'Strong area estimate.' : 'Area estimate was off.', rawScore >= 75, `Relative error: ${(relativeError * 100).toFixed(1)}%`);
};
export const evaluateLocationQuestion = (unit, guess, hintUsed) => {
    if (!guess) {
        return null;
    }
    const insideBoundary = isPointInsideGeometry(guess, unit.geometry);
    const distanceToBoundaryKm = distanceToGeometryKm(guess, unit.geometry);
    const distanceToCentroidKm = haversineDistanceKm(guess, unit.centroid);
    const scoredDistanceKm = Number.isFinite(distanceToBoundaryKm) ? distanceToBoundaryKm : distanceToCentroidKm;
    const smallRegion = unit.id === 'CN-HK' || unit.id === 'CN-MO' || unit.id === 'PLW';
    const rawScore = insideBoundary ? 100 : scoreLocation(scoredDistanceKm, { smallRegion });
    return textResult('location', rawScore, hintUsed, `${guess.lat.toFixed(2)}, ${guess.lng.toFixed(2)}`, `${unit.labelPoint.lat.toFixed(2)}, ${unit.labelPoint.lng.toFixed(2)}`, insideBoundary
        ? 'Great placement: your pin is inside the boundary.'
        : rawScore >= 60
            ? 'Good map placement.'
            : 'Placement was far from target.', rawScore >= 60, `Boundary distance: ${Math.round(scoredDistanceKm)} km (centroid: ${Math.round(distanceToCentroidKm)} km)`);
};
