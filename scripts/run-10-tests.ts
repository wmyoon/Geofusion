import { sampleChinaRegistry } from '../src/data/sample-china-registry.ts';
import { sampleWorldRegistry } from '../src/data/sample-world-registry.ts';
import { evaluateLocationQuestion, evaluateTextQuestion } from '../src/lib/quiz.ts';
import { scoreArea, scorePopulation } from '../src/lib/scoring.ts';

type TestCase = {
  name: string;
  run: () => void;
};

const assertEqual = <T>(actual: T, expected: T, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message} (expected: ${String(expected)}, actual: ${String(actual)})`);
  }
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const usa = sampleWorldRegistry.units.find((unit) => unit.id === 'USA');
const palau = sampleWorldRegistry.units.find((unit) => unit.id === 'PLW');
const guangdong = sampleChinaRegistry.units.find((unit) => unit.id === 'CN-GD');

if (!usa || !palau || !guangdong) {
  throw new Error('Missing required sample units, cannot run tests.');
}

const tests: TestCase[] = [
  {
    name: 'Population score: e <= 10% gives 100',
    run: () => assertEqual(scorePopulation(0.1), 100, 'Population 10% threshold failed'),
  },
  {
    name: 'Population score: e <= 25% gives 75',
    run: () => assertEqual(scorePopulation(0.25), 75, 'Population 25% threshold failed'),
  },
  {
    name: 'Population score: e <= 40% gives 50',
    run: () => assertEqual(scorePopulation(0.4), 50, 'Population 40% threshold failed'),
  },
  {
    name: 'Population score: e <= 50% gives 30',
    run: () => assertEqual(scorePopulation(0.5), 30, 'Population 50% threshold failed'),
  },
  {
    name: 'Population score: e > 50% gives 0',
    run: () => assertEqual(scorePopulation(0.51), 0, 'Population >50% threshold failed'),
  },
  {
    name: 'Area score: e <= 10% gives 100',
    run: () => assertEqual(scoreArea(0.1), 100, 'Area 10% threshold failed'),
  },
  {
    name: 'Area score: e <= 25% gives 75',
    run: () => assertEqual(scoreArea(0.25), 75, 'Area 25% threshold failed'),
  },
  {
    name: 'Area score: e > 50% gives 0',
    run: () => assertEqual(scoreArea(0.51), 0, 'Area >50% threshold failed'),
  },
  {
    name: 'Location score: inside boundary gives 100',
    run: () => {
      const result = evaluateLocationQuestion(usa, { ...usa.labelPoint }, false);
      assert(result !== null, 'Location result should not be null');
      assertEqual(result.rawScore, 100, 'Inside-boundary location should score 100');
    },
  },
  {
    name: 'Capital aliases accepted across datasets',
    run: () => {
      const palauResult = evaluateTextQuestion('capital', palau, 'Koror', false);
      assert(palauResult !== null, 'Palau capital result should not be null');
      assert(palauResult.isCorrect, 'Palau alias should be marked correct');

      const gdResult = evaluateTextQuestion('capital', guangdong, 'Canton', false);
      assert(gdResult !== null, 'Guangdong capital result should not be null');
      assert(gdResult.isCorrect, 'Guangdong alias should be marked correct');
    },
  },
];

let passed = 0;

tests.forEach((test, index) => {
  try {
    test.run();
    passed += 1;
    console.log(`PASS ${index + 1}/${tests.length} - ${test.name}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${index + 1}/${tests.length} - ${test.name}: ${reason}`);
  }
});

console.log(`\nSummary: ${passed}/${tests.length} tests passed.`);
if (passed !== tests.length) {
  process.exitCode = 1;
}
