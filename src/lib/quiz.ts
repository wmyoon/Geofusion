import { distanceToGeometryKm, haversineDistanceKm, isPointInsideGeometry } from './geo';
import { scoreArea, scoreLocation, scorePopulation } from './scoring';
import { equalsAlias, formatCompact, formatNumber, parseHumanNumber, similarityScore } from './strings';
import { GeoScope, GeoUnitRecord, Point, QuestionResult, QuizDimension } from '../types';

export const WORLD_QUESTION_ORDER: QuizDimension[] = ['outline', 'location', 'capital', 'population', 'area'];
export const CHINA_QUESTION_ORDER: QuizDimension[] = [
  'outline',
  'location',
  'capital',
  'population',
  'area',
  'chineseName',
];

const hasChineseLocalName = (unit: GeoUnitRecord): boolean => Boolean(unit.nameLocal && unit.nameLocal.trim());

export const questionOrderForScope = (scope: GeoScope, units: GeoUnitRecord[]): QuizDimension[] => {
  if (scope !== 'china') {
    return WORLD_QUESTION_ORDER;
  }

  return units.some(hasChineseLocalName) ? CHINA_QUESTION_ORDER : WORLD_QUESTION_ORDER;
};

const HINT_PENALTY = 15;

const scopeEntityLabel = (scope: GeoScope): string => (scope === 'world' ? 'country' : 'province-level division');

export const dimensionLabel = (dimension: QuizDimension): string => {
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

  if (dimension === 'chineseName') {
    return 'Chinese Name';
  }

  return 'Area';
};

export const questionPrompt = (
  dimension: QuizDimension,
  unit: GeoUnitRecord,
  scope: GeoScope,
): string => {
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

  if (dimension === 'chineseName') {
    return 'Choose the province/division that matches this Chinese name.';
  }

  return `Estimate ${unit.name}'s area in km² (${unit.areaKm2.refDate}).`;
};

const magnitudeHint = (value: number, suffix: 'people' | 'km²'): string => {
  if (value <= 0) {
    return `Around 0 ${suffix}.`;
  }

  const exponent = Math.floor(Math.log10(value));
  const lower = 10 ** exponent;
  const upper = 10 ** (exponent + 1);

  return `Order of magnitude: ${formatCompact(lower)} to ${formatCompact(upper)} ${suffix}.`;
};

export const questionHint = (dimension: QuizDimension, unit: GeoUnitRecord): string => {
  if (dimension === 'outline' || dimension === 'location') {
    return `Region hint: ${unit.regionHint}.`;
  }

  if (dimension === 'capital') {
    return `Starts with "${unit.capitalPrimary[0]}", ${unit.capitalPrimary.length} characters.`;
  }

  if (dimension === 'population') {
    return magnitudeHint(unit.population.value, 'people');
  }

  if (dimension === 'chineseName') {
    return `Region hint: ${unit.regionHint}.`;
  }

  return magnitudeHint(unit.areaKm2.value, 'km²');
};

const withPenalty = (score: number, hintUsed: boolean): number =>
  hintUsed ? Math.max(0, score - HINT_PENALTY) : score;

const textResult = (
  dimension: QuizDimension,
  rawScore: number,
  hintUsed: boolean,
  guessLabel: string,
  answerLabel: string,
  feedback: string,
  isCorrect: boolean,
  detail?: string,
): QuestionResult => ({
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

const acceptedUnitNames = (unit: GeoUnitRecord): string[] => [
  unit.name,
  ...(unit.nameLocal ? [unit.nameLocal] : []),
  ...unit.aliases,
  unit.code,
];

const acceptedCapitalNames = (unit: GeoUnitRecord): string[] => [
  unit.capitalPrimary,
  ...unit.capitalAliases,
];

export const evaluateOutlineTextQuestion = (
  unit: GeoUnitRecord,
  guessText: string,
  hintUsed: boolean,
): QuestionResult | null => {
  const trimmedGuess = guessText.trim();
  if (!trimmedGuess) {
    return null;
  }

  const options = acceptedUnitNames(unit);
  const isExact = equalsAlias(trimmedGuess, options);
  const bestSimilarity = Math.max(...options.map((value) => similarityScore(trimmedGuess, value)));

  const rawScore = isExact ? 100 : bestSimilarity >= 0.9 ? 70 : bestSimilarity >= 0.78 ? 40 : 0;

  return textResult(
    'outline',
    rawScore,
    hintUsed,
    trimmedGuess,
    unit.name,
    isExact ? 'Correct outline match.' : rawScore > 0 ? 'Close, but not exact.' : 'Not a match this time.',
    isExact,
  );
};

export const evaluateTextQuestion = (
  dimension: 'capital' | 'population' | 'area',
  unit: GeoUnitRecord,
  guessText: string,
  hintUsed: boolean,
): QuestionResult | null => {
  const trimmedGuess = guessText.trim();
  if (!trimmedGuess) {
    return null;
  }

  if (dimension === 'capital') {
    const options = acceptedCapitalNames(unit);
    const isExact = equalsAlias(trimmedGuess, options);
    const bestSimilarity = Math.max(...options.map((value) => similarityScore(trimmedGuess, value)));

    const rawScore = isExact ? 100 : bestSimilarity >= 0.9 ? 80 : bestSimilarity >= 0.78 ? 50 : 0;

    return textResult(
      'capital',
      rawScore,
      hintUsed,
      trimmedGuess,
      unit.capitalPrimary,
      isExact ? 'Correct capital.' : rawScore > 0 ? 'Close, but not an accepted alias.' : 'Incorrect capital guess.',
      isExact,
    );
  }

  const parsed = parseHumanNumber(trimmedGuess);
  if (parsed === null || parsed <= 0) {
    return null;
  }

  if (dimension === 'population') {
    const actual = unit.population.value;
    const relativeError = Math.abs(parsed - actual) / actual;
    const rawScore = scorePopulation(relativeError);

    return textResult(
      'population',
      rawScore,
      hintUsed,
      formatNumber(parsed),
      formatNumber(actual),
      rawScore >= 75 ? 'Strong population estimate.' : 'Population estimate was off.',
      rawScore >= 75,
      `Relative error: ${(relativeError * 100).toFixed(1)}%`,
    );
  }

  const actual = unit.areaKm2.value;
  const relativeError = Math.abs(parsed - actual) / actual;
  const rawScore = scoreArea(relativeError);

  return textResult(
    'area',
    rawScore,
    hintUsed,
    `${formatNumber(parsed)} km²`,
    `${formatNumber(actual)} km²`,
    rawScore >= 75 ? 'Strong area estimate.' : 'Area estimate was off.',
    rawScore >= 75,
    `Relative error: ${(relativeError * 100).toFixed(1)}%`,
  );
};

export const evaluateLocationQuestion = (
  unit: GeoUnitRecord,
  guess: Point | null,
  hintUsed: boolean,
): QuestionResult | null => {
  if (!guess) {
    return null;
  }

  const insideBoundary = isPointInsideGeometry(guess, unit.geometry);
  const distanceToBoundaryKm = distanceToGeometryKm(guess, unit.geometry);
  const distanceToCentroidKm = haversineDistanceKm(guess, unit.centroid);
  const scoredDistanceKm = Number.isFinite(distanceToBoundaryKm) ? distanceToBoundaryKm : distanceToCentroidKm;

  const smallRegion = unit.id === 'CN-HK' || unit.id === 'CN-MO' || unit.id === 'PLW';
  const rawScore = insideBoundary ? 100 : scoreLocation(scoredDistanceKm, { smallRegion });

  return textResult(
    'location',
    rawScore,
    hintUsed,
    `${guess.lat.toFixed(2)}, ${guess.lng.toFixed(2)}`,
    `${unit.labelPoint.lat.toFixed(2)}, ${unit.labelPoint.lng.toFixed(2)}`,
    insideBoundary
      ? 'Great placement: your pin is inside the boundary.'
      : rawScore >= 60
        ? 'Good map placement.'
        : 'Placement was far from target.',
    rawScore >= 60,
    `Boundary distance: ${Math.round(scoredDistanceKm)} km (centroid: ${Math.round(distanceToCentroidKm)} km)`,
  );
};

export const evaluateChineseNameChoiceQuestion = (
  unit: GeoUnitRecord,
  guess: GeoUnitRecord | null,
  hintUsed: boolean,
): QuestionResult | null => {
  if (!guess) {
    return null;
  }

  const isCorrect = guess.id === unit.id;
  const rawScore = isCorrect ? 100 : 0;

  return textResult(
    'chineseName',
    rawScore,
    hintUsed,
    guess.name,
    unit.name,
    isCorrect ? 'Correct province/division match.' : 'Incorrect province/division choice.',
    isCorrect,
    `Chinese name shown: ${unit.nameLocal ?? 'N/A'}`,
  );
};
