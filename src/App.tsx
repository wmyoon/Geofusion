import { ReactNode, useEffect, useMemo, useState } from 'react';
import { OutlinePreview } from './components/OutlinePreview';
import { WorldMapPicker } from './components/WorldMapPicker';
import { mulberry32 } from './lib/random';
import {
  dimensionLabel,
  evaluateChineseNameChoiceQuestion,
  evaluateLocationQuestion,
  evaluateOutlineTextQuestion,
  evaluateTextQuestion,
  questionHint,
  questionOrderForScope,
  questionPrompt,
} from './lib/quiz';
import { loadRegistries } from './lib/registry';
import { applyRoundToProgress, createEmptyProgress, loadProgress, saveProgress } from './lib/storage';
import { formatNumber } from './lib/strings';
import { GeoRegistryBundle, GeoScope, GeoUnitRecord, Point, ProgressState, QuestionResult, QuizDimension } from './types';

type AppPhase = 'loading' | 'intro' | 'quiz' | 'summary' | 'error';

type RoundQuestion = {
  dimension: QuizDimension;
  unit: GeoUnitRecord;
  choiceOptionIds?: string[];
};

type RoundSummary = {
  scope: GeoScope;
  questions: RoundQuestion[];
  results: QuestionResult[];
  averageScore: number;
  unitsUsed: number;
};

type ChinaSortMetric = 'area' | 'population';
type ChinaPanel = 'none' | 'map' | 'capitals' | 'stats';

type ChinaProvinceRow = {
  rank: number;
  id: string;
  name: string;
  nameLocal?: string;
  areaKm2: number;
  population: number;
};

type ChinaCapitalRow = {
  id: string;
  name: string;
  nameLocal?: string;
  capitalPrimary: string;
  capitalAliases: string[];
};

type TopActionButtonProps = {
  label: string;
  caption: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
};

const TopActionButton = ({ label, caption, icon, active, onClick, disabled = false }: TopActionButtonProps) => (
  <button
    type="button"
    className={active ? 'icon-button active' : 'icon-button'}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
  >
    {icon}
    <span className="icon-button-label" aria-hidden="true">
      {caption}
    </span>
    <span className="sr-only">{label}</span>
  </button>
);

const MapPanelIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M8 5 3 7v12l5-2 8 2 5-2V5l-5 2-8-2zm0 0v12m8-10v12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CapitalsPanelIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M3 20h18M6 20v-6h12v6M5 14l7-5 7 5M12 9V4m-2 0h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const StatsPanelIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M4 5h16M4 11h16M4 17h16M4 5v14M10 5v14M16 5v14M20 5v14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const scoreChipClass = (score: number): string => {
  if (score >= 80) {
    return 'score-chip strong';
  }

  if (score >= 60) {
    return 'score-chip medium';
  }

  return 'score-chip weak';
};

const averageScore = (results: QuestionResult[]): number =>
  results.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(1, results.length);

const formatPercent = (value: number): string => `${Math.round(value)}%`;

const scopeLabel = (scope: GeoScope): string => (scope === 'world' ? 'World Countries' : 'China Provinces');

const scopeDescription = (scope: GeoScope): string =>
  scope === 'world'
    ? 'Quiz yourself on world countries across outline, location, capital, population, and area.'
    : 'Quiz yourself on China provincial-level divisions across outline, location, capital, population, area, and Chinese-name recognition.';

const unitProgressKey = (scope: GeoScope, unitId: string): string => `${scope}:${unitId}`;

const shuffled = <T,>(values: T[], rng: () => number): T[] => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const buildChoiceOptionIds = (
  units: GeoUnitRecord[],
  answer: GeoUnitRecord,
  rng: () => number,
): string[] => {
  const distractors = shuffled(
    units.filter((unit) => unit.id !== answer.id),
    rng,
  ).slice(0, 3);

  return shuffled([answer, ...distractors], rng).map((unit) => unit.id);
};

const buildRoundQuestions = (
  units: GeoUnitRecord[],
  dimensions: QuizDimension[],
  seedValue: number,
  previousUnitId: string | null,
): RoundQuestion[] => {
  const rng = mulberry32(seedValue);
  const shuffledDimensions = shuffled([...dimensions], mulberry32(seedValue + 71));
  const questions: RoundQuestion[] = [];
  let previousId = previousUnitId;

  shuffledDimensions.forEach((dimension) => {
    const unitPoolBase =
      dimension === 'chineseName'
        ? units.filter((candidate) => Boolean(candidate.nameLocal && candidate.nameLocal.trim()))
        : units;
    const unitPool = unitPoolBase.length > 0 ? unitPoolBase : units;

    let unit = unitPool[Math.floor(rng() * unitPool.length)];

    if (unitPool.length > 1) {
      let guard = 0;
      while (unit.id === previousId && guard < 50) {
        unit = unitPool[Math.floor(rng() * unitPool.length)];
        guard += 1;
      }
    }

    const question: RoundQuestion = { dimension, unit };
    if (dimension === 'chineseName') {
      question.choiceOptionIds = buildChoiceOptionIds(unitPool, unit, rng);
    }

    questions.push(question);
    previousId = unit.id;
  });

  return questions;
};

const topDimension = (progress: ProgressState): { dimension: QuizDimension; avg: number } | null => {
  const entries = (Object.entries(progress.dimensions) as Array<[QuizDimension, ProgressState['dimensions'][QuizDimension]]>)
    .filter(([, value]) => value.attempts > 0)
    .map(([dimension, value]) => ({
      dimension,
      avg: value.totalScore / value.attempts,
    }));

  if (entries.length === 0) {
    return null;
  }

  entries.sort((a, b) => b.avg - a.avg);
  return entries[0];
};

const App = () => {
  const [phase, setPhase] = useState<AppPhase>('loading');
  const [registries, setRegistries] = useState<Record<GeoScope, GeoRegistryBundle> | null>(null);
  const [selectedScope, setSelectedScope] = useState<GeoScope>('world');
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState<ProgressState>(() =>
    typeof window !== 'undefined' ? loadProgress() : createEmptyProgress(),
  );

  const [seed] = useState<number>(() => Date.now() % 2_147_483_647);
  const [roundCount, setRoundCount] = useState(0);
  const [lastQuestionUnitByScope, setLastQuestionUnitByScope] = useState<Record<GeoScope, string | null>>({
    world: null,
    china: null,
  });

  const [roundQuestions, setRoundQuestions] = useState<RoundQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);

  const [textGuess, setTextGuess] = useState('');
  const [choiceGuessId, setChoiceGuessId] = useState<string | null>(null);
  const [locationGuess, setLocationGuess] = useState<Point | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<QuestionResult | null>(null);
  const [inputError, setInputError] = useState('');

  const [summary, setSummary] = useState<RoundSummary | null>(null);
  const [activeChinaPanel, setActiveChinaPanel] = useState<ChinaPanel>('none');
  const [chinaSortMetric, setChinaSortMetric] = useState<ChinaSortMetric>('area');

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const loaded = await loadRegistries();
        setRegistries(loaded);
        setPhase('intro');
      } catch {
        setErrorMessage('Could not load geography registries.');
        setPhase('error');
      }
    };

    void run();
  }, []);

  const activeRegistry = registries?.[selectedScope] ?? null;
  const chinaRegistry = registries?.china ?? null;
  const questionOrder = useMemo<QuizDimension[]>(
    () => (activeRegistry ? questionOrderForScope(selectedScope, activeRegistry.units) : questionOrderForScope(selectedScope, [])),
    [activeRegistry, selectedScope],
  );

  const chinaProvinceRows = useMemo<ChinaProvinceRow[]>(() => {
    if (!chinaRegistry) {
      return [];
    }

    const rows = chinaRegistry.units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      nameLocal: unit.nameLocal,
      areaKm2: unit.areaKm2.value,
      population: unit.population.value,
    }));

    rows.sort((left, right) => {
      if (chinaSortMetric === 'area') {
        return right.areaKm2 - left.areaKm2 || right.population - left.population;
      }

      return right.population - left.population || right.areaKm2 - left.areaKm2;
    });

    return rows.map((row, index) => ({
      rank: index + 1,
      ...row,
    }));
  }, [chinaRegistry, chinaSortMetric]);

  const chinaAreaRefs = useMemo(() => {
    if (!chinaRegistry) {
      return '';
    }

    return [...new Set(chinaRegistry.units.map((unit) => unit.areaKm2.refDate))].sort().join(', ');
  }, [chinaRegistry]);

  const chinaPopulationRefs = useMemo(() => {
    if (!chinaRegistry) {
      return '';
    }

    return [...new Set(chinaRegistry.units.map((unit) => unit.population.refDate))].sort().join(', ');
  }, [chinaRegistry]);

  const chinaCapitalRows = useMemo<ChinaCapitalRow[]>(() => {
    if (!chinaRegistry) {
      return [];
    }

    return [...chinaRegistry.units]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((unit) => ({
        id: unit.id,
        name: unit.name,
        nameLocal: unit.nameLocal,
        capitalPrimary: unit.capitalPrimary,
        capitalAliases: unit.capitalAliases,
      }));
  }, [chinaRegistry]);

  const resetQuestionState = (): void => {
    setTextGuess('');
    setChoiceGuessId(null);
    setLocationGuess(null);
    setHintVisible(false);
    setHintUsed(false);
    setSubmittedResult(null);
    setInputError('');
  };

  const resetToIntro = (): void => {
    setRoundQuestions([]);
    setQuestionIndex(0);
    setResults([]);
    setSummary(null);
    resetQuestionState();
    setPhase('intro');
  };

  const switchScope = (scope: GeoScope): void => {
    setSelectedScope(scope);
    resetToIntro();
  };

  const startRound = (): void => {
    if (!activeRegistry || activeRegistry.units.length === 0) {
      return;
    }

    const generated = buildRoundQuestions(
      activeRegistry.units,
      questionOrder,
      seed + roundCount * 7919 + 17,
      lastQuestionUnitByScope[selectedScope],
    );

    setRoundQuestions(generated);
    setQuestionIndex(0);
    setResults([]);
    setSummary(null);
    resetQuestionState();
    setPhase('quiz');
  };

  const currentQuestion = roundQuestions[questionIndex] ?? null;
  const currentDimension = currentQuestion?.dimension ?? questionOrder[0] ?? 'outline';
  const activeUnit = currentQuestion?.unit ?? null;
  const choiceOptions = useMemo<GeoUnitRecord[]>(() => {
    if (!activeRegistry || !currentQuestion?.choiceOptionIds) {
      return [];
    }

    const byId = new Map(activeRegistry.units.map((unit) => [unit.id, unit]));
    return currentQuestion.choiceOptionIds
      .map((optionId) => byId.get(optionId))
      .filter((unit): unit is GeoUnitRecord => Boolean(unit));
  }, [activeRegistry, currentQuestion]);

  const submitAnswer = (): void => {
    if (!activeUnit || submittedResult) {
      return;
    }

    let next: QuestionResult | null = null;

    if (currentDimension === 'outline') {
      next = evaluateOutlineTextQuestion(activeUnit, textGuess, hintUsed);
    }

    if (currentDimension === 'location') {
      next = evaluateLocationQuestion(activeUnit, locationGuess, hintUsed);
    }

    if (currentDimension === 'chineseName') {
      const selectedUnit = choiceOptions.find((option) => option.id === choiceGuessId) ?? null;
      next = evaluateChineseNameChoiceQuestion(activeUnit, selectedUnit, hintUsed);
    }

    if (currentDimension === 'capital' || currentDimension === 'population' || currentDimension === 'area') {
      next = evaluateTextQuestion(currentDimension, activeUnit, textGuess, hintUsed);
    }

    if (!next) {
      setInputError('Please enter a valid answer before submitting.');
      return;
    }

    setInputError('');
    setSubmittedResult(next);
  };

  const proceed = (): void => {
    if (!submittedResult || roundQuestions.length === 0) {
      return;
    }

    const mergedResults = [...results, submittedResult];

    if (questionIndex < roundQuestions.length - 1) {
      setResults(mergedResults);
      setQuestionIndex((value) => value + 1);
      resetQuestionState();
      return;
    }

    const roundAverage = averageScore(mergedResults);
    setSummary({
      scope: selectedScope,
      questions: roundQuestions,
      results: mergedResults,
      averageScore: roundAverage,
      unitsUsed: new Set(roundQuestions.map((question) => question.unit.id)).size,
    });

    const updatedProgress = applyRoundToProgress(
      progress,
      roundQuestions.map((question) => unitProgressKey(selectedScope, question.unit.id)),
      mergedResults,
    );
    setProgress(updatedProgress);
    saveProgress(updatedProgress);

    const lastQuestion = roundQuestions[roundQuestions.length - 1];
    setLastQuestionUnitByScope((previous) => ({
      ...previous,
      [selectedScope]: lastQuestion ? lastQuestion.unit.id : null,
    }));
    setRoundCount((value) => value + 1);
    setPhase('summary');
  };

  const aggregateAverage = useMemo(() => {
    const total = Object.values(progress.dimensions).reduce((sum, item) => sum + item.totalScore, 0);
    const attempts = Object.values(progress.dimensions).reduce((sum, item) => sum + item.attempts, 0);
    return attempts === 0 ? 0 : total / attempts;
  }, [progress]);

  const dimensionAverages = useMemo(
    () =>
      (Object.entries(progress.dimensions) as Array<[QuizDimension, ProgressState['dimensions'][QuizDimension]]>).map(
        ([dimension, stats]) => ({
          dimension,
          average: stats.attempts ? stats.totalScore / stats.attempts : 0,
          attempts: stats.attempts,
        }),
      ),
    [progress],
  );

  const bestDim = topDimension(progress);

  if (phase === 'loading') {
    return (
      <main className="app-shell">
        <section className="card center-card">
          <p className="eyebrow">Geo Fusion Quiz</p>
          <h1>Preparing registries...</h1>
        </section>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="app-shell">
        <section className="card center-card">
          <p className="eyebrow">Geo Fusion Quiz</p>
          <h1>Unable to start</h1>
          <p>{errorMessage}</p>
        </section>
      </main>
    );
  }

  if (!activeRegistry) {
    return (
      <main className="app-shell">
        <section className="card center-card">
          <h1>Missing active registry.</h1>
        </section>
      </main>
    );
  }

  const allUnitNames = activeRegistry.units.map((unit) => unit.name);
  const hidePopulationMetric = phase === 'quiz' && currentDimension === 'population';
  const hideAreaMetric = phase === 'quiz' && currentDimension === 'area';
  const chineseNameCharacters =
    currentDimension === 'chineseName' && activeUnit.nameLocal
      ? Array.from(activeUnit.nameLocal.replace(/\s+/g, ''))
      : [];
  const chineseNameFontSizeRem =
    chineseNameCharacters.length > 0 ? Math.min(5.2, Math.max(2.2, 15 / chineseNameCharacters.length)) : 2.2;
  const showChinaMap = activeChinaPanel === 'map';
  const showChinaCapitalTable = activeChinaPanel === 'capitals';
  const showChinaProvinceTable = activeChinaPanel === 'stats';
  const showTargetOutline =
    currentDimension === 'capital' ||
    currentDimension === 'population' ||
    currentDimension === 'area' ||
    currentDimension === 'chineseName';
  const usesTextInput =
    currentDimension === 'outline' ||
    currentDimension === 'capital' ||
    currentDimension === 'population' ||
    currentDimension === 'area';

  return (
    <main className="app-shell">
      <header className="hero card hero-compact">
        <div>
          <p className="eyebrow">Geo Fusion Quiz</p>
          <h1>{scopeLabel(selectedScope)}</h1>
          <p>{scopeDescription(selectedScope)}</p>

          <div className="mode-grid" role="radiogroup" aria-label="Geography scope">
            <button
              type="button"
              className={selectedScope === 'world' ? 'mode-button active' : 'mode-button'}
              onClick={() => switchScope('world')}
            >
              World Countries
            </button>
            <button
              type="button"
              className={selectedScope === 'china' ? 'mode-button active' : 'mode-button'}
              onClick={() => switchScope('china')}
            >
              China Provinces
            </button>
          </div>

          <div className="actions-row hero-actions">
            <TopActionButton
              label={showChinaMap ? 'China map panel active' : 'Show China map panel'}
              caption="Map"
              icon={<MapPanelIcon />}
              active={showChinaMap}
              onClick={() => setActiveChinaPanel('map')}
              disabled={!chinaRegistry}
            />
            <TopActionButton
              label={showChinaCapitalTable ? 'Province capitals panel active' : 'Show province capitals panel'}
              caption="Capitals"
              icon={<CapitalsPanelIcon />}
              active={showChinaCapitalTable}
              onClick={() => setActiveChinaPanel('capitals')}
              disabled={!chinaRegistry}
            />
            <TopActionButton
              label={showChinaProvinceTable ? 'China stats table panel active' : 'Show China stats table panel'}
              caption="Stats"
              icon={<StatsPanelIcon />}
              active={showChinaProvinceTable}
              onClick={() => setActiveChinaPanel('stats')}
              disabled={!chinaRegistry}
            />
          </div>
        </div>

        <dl className="hero-stats">
          <div>
            <dt>Rounds</dt>
            <dd>{progress.roundsPlayed}</dd>
          </div>
          <div>
            <dt>Avg Score</dt>
            <dd>{formatPercent(aggregateAverage)}</dd>
          </div>
          <div>
            <dt>Best Round</dt>
            <dd>{formatPercent(progress.bestRoundScore)}</dd>
          </div>
        </dl>
      </header>

      {showChinaMap && chinaRegistry ? (
        <section className="card stats-card" aria-label="China map">
          <div className="stats-card-head">
            <div>
              <p className="eyebrow">China Provinces</p>
              <h2>China Province Map</h2>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => setActiveChinaPanel('none')}
            >
              Close
            </button>
          </div>
          <WorldMapPicker
            units={chinaRegistry.units}
            selectedPoint={null}
            onSelect={() => {
              // Read-only map panel.
            }}
            ariaLabel="China province boundaries map"
            interactive={false}
            helpText="Read-only China province boundaries map."
            showUnitLabels
            unitLabelAccessor={(unit) => unit.nameLocal ?? unit.name}
          />
        </section>
      ) : null}

      {showChinaCapitalTable && chinaRegistry ? (
        <section className="card stats-card" aria-label="China province capitals">
          <div className="stats-card-head">
            <div>
              <p className="eyebrow">China Provinces</p>
              <h2>Province Capitals</h2>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => setActiveChinaPanel('none')}
            >
              Close
            </button>
          </div>

          <div className="stats-table-wrap">
            <table className="stats-table capitals-table">
              <thead>
                <tr>
                  <th scope="col">Province / Division</th>
                  <th scope="col">Capital</th>
                </tr>
              </thead>
              <tbody>
                {chinaCapitalRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                      {row.nameLocal ? <span>{row.nameLocal}</span> : null}
                    </td>
                    <td>
                      <strong>{row.capitalPrimary}</strong>
                      {row.capitalAliases.length > 0 ? <span>{row.capitalAliases.join(', ')}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {showChinaProvinceTable && chinaRegistry ? (
        <section className="card stats-card" aria-label="China province rankings">
          <div className="stats-card-head">
            <div>
              <p className="eyebrow">China Provinces</p>
              <h2>Area and Population Table</h2>
              <p>
                Sorted descending by{' '}
                <strong>{chinaSortMetric === 'area' ? 'area size' : 'population'}</strong>.
              </p>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => setActiveChinaPanel('none')}
            >
              Close
            </button>
          </div>

          <div className="stats-sort-row" role="radiogroup" aria-label="China table sort metric">
            <button
              type="button"
              className={chinaSortMetric === 'area' ? 'mode-button active' : 'mode-button'}
              onClick={() => setChinaSortMetric('area')}
            >
              Area Desc
            </button>
            <button
              type="button"
              className={chinaSortMetric === 'population' ? 'mode-button active' : 'mode-button'}
              onClick={() => setChinaSortMetric('population')}
            >
              Population Desc
            </button>
          </div>

          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Province / Division</th>
                  <th scope="col">Area (km²)</th>
                  <th scope="col">Population</th>
                </tr>
              </thead>
              <tbody>
                {chinaProvinceRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rank}</td>
                    <td>
                      <strong>{row.name}</strong>
                      {row.nameLocal ? <span>{row.nameLocal}</span> : null}
                    </td>
                    <td>{formatNumber(row.areaKm2)}</td>
                    <td>{formatNumber(row.population)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="map-help">
            Area reference dates: {chinaAreaRefs || 'n/a'} · Population reference dates: {chinaPopulationRefs || 'n/a'}
          </p>
        </section>
      ) : null}

      <section className="layout-grid">
        <article className="card quiz-card">
          {phase === 'intro' ? (
            <>
              <p className="eyebrow">Ready</p>
              <h2>Start Mixed Round</h2>
              <p>
                Each round asks {questionOrder.length} randomized questions and guarantees consecutive
                questions never use the same {selectedScope === 'world' ? 'country' : 'division'}.
              </p>
              <button type="button" className="button primary" onClick={startRound}>
                Start Round
              </button>
            </>
          ) : null}

          {phase === 'quiz' && activeUnit && currentQuestion ? (
            <>
              <div className="quiz-head">
                <div>
                  <p className="eyebrow">Question {questionIndex + 1} / {roundQuestions.length}</p>
                  <h2>{dimensionLabel(currentDimension)}</h2>
                </div>
                <div className="progress-pill" aria-label="Round progress">
                  {roundQuestions.map((question, index) => {
                    const done = index < results.length;
                    const current = index === questionIndex;
                    return (
                      <span
                        key={`${question.dimension}-${question.unit.id}-${index}`}
                        className={done ? 'dot done' : current ? 'dot current' : 'dot'}
                      />
                    );
                  })}
                </div>
              </div>

              <p className="prompt">{questionPrompt(currentDimension, activeUnit, selectedScope)}</p>

              {currentDimension === 'outline' ? <OutlinePreview geometry={activeUnit.geometry} /> : null}

              {showTargetOutline ? (
                <>
                  <p className="eyebrow">Target Outline</p>
                  <OutlinePreview geometry={activeUnit.geometry} />
                </>
              ) : null}

              {currentDimension === 'chineseName' ? (
                <section className="local-name-card" aria-label="Chinese name prompt">
                  <p className="eyebrow">Chinese Name</p>
                  <p className="local-name-text" style={{ fontSize: `${chineseNameFontSizeRem}rem` }}>
                    {chineseNameCharacters.length > 0
                      ? chineseNameCharacters.map((character, index) => (
                          <span key={`${character}-${index}`} className="local-name-char">
                            {character}
                          </span>
                        ))
                      : 'N/A'}
                  </p>
                </section>
              ) : null}

              {currentDimension === 'location' ? (
                <WorldMapPicker
                  units={activeRegistry.units}
                  selectedPoint={locationGuess}
                  onSelect={(point) => {
                    if (submittedResult) {
                      return;
                    }
                    setLocationGuess(point);
                  }}
                  targetPoint={activeUnit.labelPoint}
                  revealTarget={Boolean(submittedResult)}
                  highlightUnitId={submittedResult ? activeUnit.id : undefined}
                  ariaLabel={`${scopeLabel(selectedScope)} map picker. Click to place a pin.`}
                />
              ) : null}

              {usesTextInput ? (
                <label className="field">
                  <span>
                    {currentDimension === 'outline'
                      ? selectedScope === 'world'
                        ? 'Country name'
                        : 'Province/division name'
                      : currentDimension === 'capital'
                        ? 'Capital city'
                        : currentDimension === 'population'
                          ? 'Population estimate'
                          : 'Area estimate (km²)'}
                  </span>
                  <input
                    type="text"
                    value={textGuess}
                    list={currentDimension === 'outline' ? 'unit-name-list' : undefined}
                    placeholder={
                      currentDimension === 'population' || currentDimension === 'area'
                        ? 'Examples: 84m, 12500000, 1.2b'
                        : 'Type your answer'
                    }
                    onChange={(event) => setTextGuess(event.target.value)}
                    disabled={Boolean(submittedResult)}
                  />
                </label>
              ) : null}

              {currentDimension === 'chineseName' ? (
                <fieldset className="dimension-picker">
                  <legend>Select the matching province/division</legend>
                  <div className="option-grid">
                    {choiceOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={choiceGuessId === option.id ? 'option-button selected' : 'option-button'}
                        onClick={() => {
                          if (submittedResult) {
                            return;
                          }
                          setChoiceGuessId(option.id);
                        }}
                        disabled={Boolean(submittedResult)}
                        aria-pressed={choiceGuessId === option.id}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <datalist id="unit-name-list">
                {allUnitNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>

              <div className="actions-row">
                {!submittedResult ? (
                  <>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setHintVisible(true);
                        setHintUsed(true);
                      }}
                    >
                      Show Hint
                    </button>
                    <button type="button" className="button primary" onClick={submitAnswer}>
                      Submit
                    </button>
                  </>
                ) : (
                  <button type="button" className="button primary" onClick={proceed}>
                    {questionIndex === roundQuestions.length - 1 ? 'Finish Round' : 'Next Question'}
                  </button>
                )}
              </div>

              {hintVisible ? <p className="hint">Hint: {questionHint(currentDimension, activeUnit)}</p> : null}
              {inputError ? <p className="error-text">{inputError}</p> : null}

              {submittedResult ? (
                <section className="feedback">
                  <div className="feedback-row">
                    <span className={scoreChipClass(submittedResult.finalScore)}>{submittedResult.finalScore}</span>
                    <p>{submittedResult.feedback}</p>
                  </div>
                  <p>
                    <strong>Your answer:</strong> {submittedResult.guessLabel}
                  </p>
                  <p>
                    <strong>Correct answer:</strong> {submittedResult.answerLabel}
                  </p>
                  {submittedResult.detail ? <p>{submittedResult.detail}</p> : null}
                  {submittedResult.hintUsed ? <p className="penalty-note">Hint penalty applied: -15 points.</p> : null}
                </section>
              ) : null}
            </>
          ) : null}

          {phase === 'summary' && summary ? (
            <>
              <p className="eyebrow">Round Summary · {scopeLabel(summary.scope)}</p>
              <h2>{summary.unitsUsed} Units</h2>
              <p>
                Round score: <strong>{formatPercent(summary.averageScore)}</strong>
              </p>

              <ul className="result-list">
                {summary.results.map((item, index) => {
                  const question = summary.questions[index];
                  return (
                    <li key={`${item.dimension}-${question?.unit.id ?? 'unknown'}-${index}`}>
                      <span>
                        {dimensionLabel(item.dimension)} · {question?.unit.name ?? 'Unknown'}
                      </span>
                      <span className={scoreChipClass(item.finalScore)}>{item.finalScore}</span>
                    </li>
                  );
                })}
              </ul>

              <div className="actions-row">
                <button type="button" className="button primary" onClick={startRound}>
                  New Round
                </button>
                <button type="button" className="button secondary" onClick={resetToIntro}>
                  Change Scope
                </button>
              </div>
            </>
          ) : null}
        </article>

        <aside className="card side-card">
          <h3>Progress Tracking</h3>
          <p>
            {bestDim
              ? `Strongest dimension: ${dimensionLabel(bestDim.dimension)} (${formatPercent(bestDim.avg)} avg)`
              : 'No attempts yet.'}
          </p>

          <ul className="dimension-list">
            {dimensionAverages.map((item) => (
              <li key={item.dimension}>
                <div>
                  <strong>{dimensionLabel(item.dimension)}</strong>
                  <span>{item.attempts} attempts</span>
                </div>
                <div>{formatPercent(item.average)}</div>
              </li>
            ))}
          </ul>

          <h3>Data Note</h3>
          <p>{activeRegistry.dataNote}</p>
          <p>
            Boundaries: {activeRegistry.boundaryModel}
            <br />
            Units loaded: {activeRegistry.units.length}
          </p>

          {activeUnit && phase === 'quiz' ? (
            <p>
              Current unit metrics:
              <br />
              {!hidePopulationMetric ? (
                <>
                  Population ({activeUnit.population.refDate}): {formatNumber(activeUnit.population.value)}
                  <br />
                </>
              ) : null}
              {!hideAreaMetric ? (
                <>
                  Area ({activeUnit.areaKm2.refDate}): {formatNumber(activeUnit.areaKm2.value)} km²
                </>
              ) : null}
            </p>
          ) : null}
        </aside>
      </section>
    </main>
  );
};

export default App;
