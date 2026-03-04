export type GeoScope = 'world' | 'china';

export type QuizDimension =
  | 'outline'
  | 'location'
  | 'capital'
  | 'population'
  | 'area'
  | 'chineseName';

export type Point = {
  lat: number;
  lng: number;
};

export type RegionGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};

export type TimedMetric = {
  value: number;
  refDate: string;
  source?: string;
};

export type GeoUnitRecord = {
  id: string;
  code: string;
  name: string;
  nameLocal?: string;
  aliases: string[];
  kind: string;
  regionHint: string;
  capitalPrimary: string;
  capitalAliases: string[];
  centroid: Point;
  labelPoint: Point;
  population: TimedMetric;
  areaKm2: TimedMetric;
  geometry: RegionGeometry;
};

export type GeoRegistryBundle = {
  scope: GeoScope;
  title: string;
  version: string;
  generatedAt: string;
  boundaryModel: string;
  dataNote: string;
  referenceLabel: string;
  source: Record<string, string>;
  units: GeoUnitRecord[];
};

export type QuestionResult = {
  dimension: QuizDimension;
  rawScore: number;
  finalScore: number;
  hintUsed: boolean;
  isCorrect: boolean;
  guessLabel: string;
  answerLabel: string;
  feedback: string;
  detail?: string;
};

export type DimensionProgress = {
  attempts: number;
  totalScore: number;
  bestScore: number;
};

export type UnitProgress = {
  rounds: number;
  totalScore: number;
  bestScore: number;
  lastScore: number;
  lastPlayedAt: string;
};

export type ProgressState = {
  roundsPlayed: number;
  totalQuestions: number;
  bestRoundScore: number;
  dimensions: Record<QuizDimension, DimensionProgress>;
  units: Record<string, UnitProgress>;
};
