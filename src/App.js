import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { OutlinePreview } from './components/OutlinePreview';
import { WorldMapPicker } from './components/WorldMapPicker';
import { mulberry32 } from './lib/random';
import { dimensionLabel, evaluateChineseNameChoiceQuestion, evaluateLocationQuestion, evaluateOutlineTextQuestion, evaluateTextQuestion, questionHint, questionOrderForScope, questionPrompt, } from './lib/quiz';
import { loadRegistries } from './lib/registry';
import { applyRoundToProgress, createEmptyProgress, loadProgress, saveProgress } from './lib/storage';
import { formatNumber } from './lib/strings';
const TopActionButton = ({ label, caption, icon, active, onClick, disabled = false }) => (_jsxs("button", { type: "button", className: active ? 'icon-button active' : 'icon-button', onClick: onClick, disabled: disabled, "aria-label": label, title: label, children: [icon, _jsx("span", { className: "icon-button-label", "aria-hidden": "true", children: caption }), _jsx("span", { className: "sr-only", children: label })] }));
const MapPanelIcon = () => (_jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M8 5 3 7v12l5-2 8 2 5-2V5l-5 2-8-2zm0 0v12m8-10v12", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) }));
const CapitalsPanelIcon = () => (_jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M3 20h18M6 20v-6h12v6M5 14l7-5 7 5M12 9V4m-2 0h4", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) }));
const StatsPanelIcon = () => (_jsx("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", children: _jsx("path", { d: "M4 5h16M4 11h16M4 17h16M4 5v14M10 5v14M16 5v14M20 5v14", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" }) }));
const scoreChipClass = (score) => {
    if (score >= 80) {
        return 'score-chip strong';
    }
    if (score >= 60) {
        return 'score-chip medium';
    }
    return 'score-chip weak';
};
const averageScore = (results) => results.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(1, results.length);
const formatPercent = (value) => `${Math.round(value)}%`;
const scopeLabel = (scope) => (scope === 'world' ? 'World Countries' : 'China Provinces');
const scopeDescription = (scope) => scope === 'world'
    ? 'Quiz yourself on world countries across outline, location, capital, population, and area.'
    : 'Quiz yourself on China provincial-level divisions across outline, location, capital, population, area, and Chinese-name recognition.';
const unitProgressKey = (scope, unitId) => `${scope}:${unitId}`;
const shuffled = (values, rng) => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};
const buildChoiceOptionIds = (units, answer, rng) => {
    const distractors = shuffled(units.filter((unit) => unit.id !== answer.id), rng).slice(0, 3);
    return shuffled([answer, ...distractors], rng).map((unit) => unit.id);
};
const buildRoundQuestions = (units, dimensions, seedValue, previousUnitId) => {
    const rng = mulberry32(seedValue);
    const shuffledDimensions = shuffled([...dimensions], mulberry32(seedValue + 71));
    const questions = [];
    let previousId = previousUnitId;
    shuffledDimensions.forEach((dimension) => {
        const unitPoolBase = dimension === 'chineseName'
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
        const question = { dimension, unit };
        if (dimension === 'chineseName') {
            question.choiceOptionIds = buildChoiceOptionIds(unitPool, unit, rng);
        }
        questions.push(question);
        previousId = unit.id;
    });
    return questions;
};
const topDimension = (progress) => {
    const entries = Object.entries(progress.dimensions)
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
    const [phase, setPhase] = useState('loading');
    const [registries, setRegistries] = useState(null);
    const [selectedScope, setSelectedScope] = useState('world');
    const [errorMessage, setErrorMessage] = useState('');
    const [progress, setProgress] = useState(() => typeof window !== 'undefined' ? loadProgress() : createEmptyProgress());
    const [seed] = useState(() => Date.now() % 2147483647);
    const [roundCount, setRoundCount] = useState(0);
    const [lastQuestionUnitByScope, setLastQuestionUnitByScope] = useState({
        world: null,
        china: null,
    });
    const [roundQuestions, setRoundQuestions] = useState([]);
    const [questionIndex, setQuestionIndex] = useState(0);
    const [results, setResults] = useState([]);
    const [textGuess, setTextGuess] = useState('');
    const [choiceGuessId, setChoiceGuessId] = useState(null);
    const [locationGuess, setLocationGuess] = useState(null);
    const [hintVisible, setHintVisible] = useState(false);
    const [hintUsed, setHintUsed] = useState(false);
    const [submittedResult, setSubmittedResult] = useState(null);
    const [inputError, setInputError] = useState('');
    const [summary, setSummary] = useState(null);
    const [activeChinaPanel, setActiveChinaPanel] = useState('none');
    const [chinaSortMetric, setChinaSortMetric] = useState('area');
    useEffect(() => {
        const run = async () => {
            try {
                const loaded = await loadRegistries();
                setRegistries(loaded);
                setPhase('intro');
            }
            catch {
                setErrorMessage('Could not load geography registries.');
                setPhase('error');
            }
        };
        void run();
    }, []);
    const activeRegistry = registries?.[selectedScope] ?? null;
    const chinaRegistry = registries?.china ?? null;
    const questionOrder = useMemo(() => (activeRegistry ? questionOrderForScope(selectedScope, activeRegistry.units) : questionOrderForScope(selectedScope, [])), [activeRegistry, selectedScope]);
    const chinaProvinceRows = useMemo(() => {
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
    const chinaCapitalRows = useMemo(() => {
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
    const resetQuestionState = () => {
        setTextGuess('');
        setChoiceGuessId(null);
        setLocationGuess(null);
        setHintVisible(false);
        setHintUsed(false);
        setSubmittedResult(null);
        setInputError('');
    };
    const resetToIntro = () => {
        setRoundQuestions([]);
        setQuestionIndex(0);
        setResults([]);
        setSummary(null);
        resetQuestionState();
        setPhase('intro');
    };
    const switchScope = (scope) => {
        setSelectedScope(scope);
        resetToIntro();
    };
    const startRound = () => {
        if (!activeRegistry || activeRegistry.units.length === 0) {
            return;
        }
        const generated = buildRoundQuestions(activeRegistry.units, questionOrder, seed + roundCount * 7919 + 17, lastQuestionUnitByScope[selectedScope]);
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
    const choiceOptions = useMemo(() => {
        if (!activeRegistry || !currentQuestion?.choiceOptionIds) {
            return [];
        }
        const byId = new Map(activeRegistry.units.map((unit) => [unit.id, unit]));
        return currentQuestion.choiceOptionIds
            .map((optionId) => byId.get(optionId))
            .filter((unit) => Boolean(unit));
    }, [activeRegistry, currentQuestion]);
    const submitAnswer = () => {
        if (!activeUnit || submittedResult) {
            return;
        }
        let next = null;
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
    const proceed = () => {
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
        const updatedProgress = applyRoundToProgress(progress, roundQuestions.map((question) => unitProgressKey(selectedScope, question.unit.id)), mergedResults);
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
    const dimensionAverages = useMemo(() => Object.entries(progress.dimensions).map(([dimension, stats]) => ({
        dimension,
        average: stats.attempts ? stats.totalScore / stats.attempts : 0,
        attempts: stats.attempts,
    })), [progress]);
    const bestDim = topDimension(progress);
    if (phase === 'loading') {
        return (_jsx("main", { className: "app-shell", children: _jsxs("section", { className: "card center-card", children: [_jsx("p", { className: "eyebrow", children: "Geo Fusion Quiz" }), _jsx("h1", { children: "Preparing registries..." })] }) }));
    }
    if (phase === 'error') {
        return (_jsx("main", { className: "app-shell", children: _jsxs("section", { className: "card center-card", children: [_jsx("p", { className: "eyebrow", children: "Geo Fusion Quiz" }), _jsx("h1", { children: "Unable to start" }), _jsx("p", { children: errorMessage })] }) }));
    }
    if (!activeRegistry) {
        return (_jsx("main", { className: "app-shell", children: _jsx("section", { className: "card center-card", children: _jsx("h1", { children: "Missing active registry." }) }) }));
    }
    const allUnitNames = activeRegistry.units.map((unit) => unit.name);
    const isChinaScope = selectedScope === 'china';
    const hidePopulationMetric = phase === 'quiz' && currentDimension === 'population';
    const hideAreaMetric = phase === 'quiz' && currentDimension === 'area';
    const chineseNameCharacters = currentDimension === 'chineseName' && activeUnit.nameLocal
        ? Array.from(activeUnit.nameLocal.replace(/\s+/g, ''))
        : [];
    const chineseNameFontSizeRem = chineseNameCharacters.length > 0 ? Math.min(5.2, Math.max(2.2, 15 / chineseNameCharacters.length)) : 2.2;
    const showChinaMap = isChinaScope && activeChinaPanel === 'map';
    const showChinaCapitalTable = isChinaScope && activeChinaPanel === 'capitals';
    const showChinaProvinceTable = isChinaScope && activeChinaPanel === 'stats';
    const showTargetOutline = currentDimension === 'capital' ||
        currentDimension === 'population' ||
        currentDimension === 'area' ||
        currentDimension === 'chineseName';
    const usesTextInput = currentDimension === 'outline' ||
        currentDimension === 'capital' ||
        currentDimension === 'population' ||
        currentDimension === 'area';
    return (_jsxs("main", { className: "app-shell", children: [_jsxs("header", { className: "hero card hero-compact", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Geo Fusion Quiz" }), _jsx("h1", { children: scopeLabel(selectedScope) }), _jsx("p", { children: scopeDescription(selectedScope) }), _jsxs("div", { className: "mode-grid", role: "radiogroup", "aria-label": "Geography scope", children: [_jsx("button", { type: "button", className: selectedScope === 'world' ? 'mode-button active' : 'mode-button', onClick: () => switchScope('world'), children: "World Countries" }), _jsx("button", { type: "button", className: selectedScope === 'china' ? 'mode-button active' : 'mode-button', onClick: () => switchScope('china'), children: "China Provinces" })] }), isChinaScope ? (_jsxs("div", { className: "actions-row hero-actions", children: [_jsx(TopActionButton, { label: showChinaMap ? 'China map panel active' : 'Show China map panel', caption: "Map", icon: _jsx(MapPanelIcon, {}), active: showChinaMap, onClick: () => setActiveChinaPanel('map'), disabled: !chinaRegistry }), _jsx(TopActionButton, { label: showChinaCapitalTable ? 'Province capitals panel active' : 'Show province capitals panel', caption: "Capitals", icon: _jsx(CapitalsPanelIcon, {}), active: showChinaCapitalTable, onClick: () => setActiveChinaPanel('capitals'), disabled: !chinaRegistry }), _jsx(TopActionButton, { label: showChinaProvinceTable ? 'China stats table panel active' : 'Show China stats table panel', caption: "Stats", icon: _jsx(StatsPanelIcon, {}), active: showChinaProvinceTable, onClick: () => setActiveChinaPanel('stats'), disabled: !chinaRegistry })] })) : null] }), _jsxs("dl", { className: "hero-stats", children: [_jsxs("div", { children: [_jsx("dt", { children: "Rounds" }), _jsx("dd", { children: progress.roundsPlayed })] }), _jsxs("div", { children: [_jsx("dt", { children: "Avg Score" }), _jsx("dd", { children: formatPercent(aggregateAverage) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Best Round" }), _jsx("dd", { children: formatPercent(progress.bestRoundScore) })] })] })] }), showChinaMap && chinaRegistry ? (_jsxs("section", { className: "card stats-card", "aria-label": "China map", children: [_jsxs("div", { className: "stats-card-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "China Provinces" }), _jsx("h2", { children: "China Province Map" })] }), _jsx("button", { type: "button", className: "button secondary", onClick: () => setActiveChinaPanel('none'), children: "Close" })] }), _jsx(WorldMapPicker, { units: chinaRegistry.units, selectedPoint: null, onSelect: () => {
                            // Read-only map panel.
                        }, ariaLabel: "China province boundaries map", interactive: false, helpText: "Read-only China province boundaries map.", showUnitLabels: true, unitLabelAccessor: (unit) => unit.nameLocal ?? unit.name })] })) : null, showChinaCapitalTable && chinaRegistry ? (_jsxs("section", { className: "card stats-card", "aria-label": "China province capitals", children: [_jsxs("div", { className: "stats-card-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "China Provinces" }), _jsx("h2", { children: "Province Capitals" })] }), _jsx("button", { type: "button", className: "button secondary", onClick: () => setActiveChinaPanel('none'), children: "Close" })] }), _jsx("div", { className: "stats-table-wrap", children: _jsxs("table", { className: "stats-table capitals-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Province / Division" }), _jsx("th", { scope: "col", children: "Capital" })] }) }), _jsx("tbody", { children: chinaCapitalRows.map((row) => (_jsxs("tr", { children: [_jsxs("td", { children: [_jsx("strong", { children: row.name }), row.nameLocal ? _jsx("span", { children: row.nameLocal }) : null] }), _jsxs("td", { children: [_jsx("strong", { children: row.capitalPrimary }), row.capitalAliases.length > 0 ? _jsx("span", { children: row.capitalAliases.join(', ') }) : null] })] }, row.id))) })] }) })] })) : null, showChinaProvinceTable && chinaRegistry ? (_jsxs("section", { className: "card stats-card", "aria-label": "China province rankings", children: [_jsxs("div", { className: "stats-card-head", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "China Provinces" }), _jsx("h2", { children: "Area and Population Table" }), _jsxs("p", { children: ["Sorted descending by", ' ', _jsx("strong", { children: chinaSortMetric === 'area' ? 'area size' : 'population' }), "."] })] }), _jsx("button", { type: "button", className: "button secondary", onClick: () => setActiveChinaPanel('none'), children: "Close" })] }), _jsxs("div", { className: "stats-sort-row", role: "radiogroup", "aria-label": "China table sort metric", children: [_jsx("button", { type: "button", className: chinaSortMetric === 'area' ? 'mode-button active' : 'mode-button', onClick: () => setChinaSortMetric('area'), children: "Area Desc" }), _jsx("button", { type: "button", className: chinaSortMetric === 'population' ? 'mode-button active' : 'mode-button', onClick: () => setChinaSortMetric('population'), children: "Population Desc" })] }), _jsx("div", { className: "stats-table-wrap", children: _jsxs("table", { className: "stats-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { scope: "col", children: "Rank" }), _jsx("th", { scope: "col", children: "Province / Division" }), _jsx("th", { scope: "col", children: "Area (km\u00B2)" }), _jsx("th", { scope: "col", children: "Population" })] }) }), _jsx("tbody", { children: chinaProvinceRows.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: row.rank }), _jsxs("td", { children: [_jsx("strong", { children: row.name }), row.nameLocal ? _jsx("span", { children: row.nameLocal }) : null] }), _jsx("td", { children: formatNumber(row.areaKm2) }), _jsx("td", { children: formatNumber(row.population) })] }, row.id))) })] }) }), _jsxs("p", { className: "map-help", children: ["Area reference dates: ", chinaAreaRefs || 'n/a', " \u00B7 Population reference dates: ", chinaPopulationRefs || 'n/a'] })] })) : null, _jsxs("section", { className: "layout-grid", children: [_jsxs("article", { className: "card quiz-card", children: [phase === 'intro' ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "eyebrow", children: "Ready" }), _jsx("h2", { children: "Start Mixed Round" }), _jsxs("p", { children: ["Each round asks ", questionOrder.length, " randomized questions and guarantees consecutive questions never use the same ", selectedScope === 'world' ? 'country' : 'division', "."] }), _jsx("button", { type: "button", className: "button primary", onClick: startRound, children: "Start Round" })] })) : null, phase === 'quiz' && activeUnit && currentQuestion ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "quiz-head", children: [_jsxs("div", { children: [_jsxs("p", { className: "eyebrow", children: ["Question ", questionIndex + 1, " / ", roundQuestions.length] }), _jsx("h2", { children: dimensionLabel(currentDimension) })] }), _jsx("div", { className: "progress-pill", "aria-label": "Round progress", children: roundQuestions.map((question, index) => {
                                                    const done = index < results.length;
                                                    const current = index === questionIndex;
                                                    return (_jsx("span", { className: done ? 'dot done' : current ? 'dot current' : 'dot' }, `${question.dimension}-${question.unit.id}-${index}`));
                                                }) })] }), _jsx("p", { className: "prompt", children: questionPrompt(currentDimension, activeUnit, selectedScope) }), currentDimension === 'outline' ? _jsx(OutlinePreview, { geometry: activeUnit.geometry }) : null, showTargetOutline ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "eyebrow", children: "Target Outline" }), _jsx(OutlinePreview, { geometry: activeUnit.geometry })] })) : null, currentDimension === 'chineseName' ? (_jsxs("section", { className: "local-name-card", "aria-label": "Chinese name prompt", children: [_jsx("p", { className: "eyebrow", children: "Chinese Name" }), _jsx("p", { className: "local-name-text", style: { fontSize: `${chineseNameFontSizeRem}rem` }, children: chineseNameCharacters.length > 0
                                                    ? chineseNameCharacters.map((character, index) => (_jsx("span", { className: "local-name-char", children: character }, `${character}-${index}`)))
                                                    : 'N/A' })] })) : null, currentDimension === 'location' ? (_jsx(WorldMapPicker, { units: activeRegistry.units, selectedPoint: locationGuess, onSelect: (point) => {
                                            if (submittedResult) {
                                                return;
                                            }
                                            setLocationGuess(point);
                                        }, targetPoint: activeUnit.labelPoint, revealTarget: Boolean(submittedResult), highlightUnitId: submittedResult ? activeUnit.id : undefined, ariaLabel: `${scopeLabel(selectedScope)} map picker. Click to place a pin.` })) : null, usesTextInput ? (_jsxs("label", { className: "field", children: [_jsx("span", { children: currentDimension === 'outline'
                                                    ? selectedScope === 'world'
                                                        ? 'Country name'
                                                        : 'Province/division name'
                                                    : currentDimension === 'capital'
                                                        ? 'Capital city'
                                                        : currentDimension === 'population'
                                                            ? 'Population estimate'
                                                            : 'Area estimate (km²)' }), _jsx("input", { type: "text", value: textGuess, list: currentDimension === 'outline' ? 'unit-name-list' : undefined, placeholder: currentDimension === 'population' || currentDimension === 'area'
                                                    ? 'Examples: 84m, 12500000, 1.2b'
                                                    : 'Type your answer', onChange: (event) => setTextGuess(event.target.value), disabled: Boolean(submittedResult) })] })) : null, currentDimension === 'chineseName' ? (_jsxs("fieldset", { className: "dimension-picker", children: [_jsx("legend", { children: "Select the matching province/division" }), _jsx("div", { className: "option-grid", children: choiceOptions.map((option) => (_jsx("button", { type: "button", className: choiceGuessId === option.id ? 'option-button selected' : 'option-button', onClick: () => {
                                                        if (submittedResult) {
                                                            return;
                                                        }
                                                        setChoiceGuessId(option.id);
                                                    }, disabled: Boolean(submittedResult), "aria-pressed": choiceGuessId === option.id, children: option.name }, option.id))) })] })) : null, _jsx("datalist", { id: "unit-name-list", children: allUnitNames.map((name) => (_jsx("option", { value: name }, name))) }), _jsx("div", { className: "actions-row", children: !submittedResult ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "button secondary", onClick: () => {
                                                        setHintVisible(true);
                                                        setHintUsed(true);
                                                    }, children: "Show Hint" }), _jsx("button", { type: "button", className: "button primary", onClick: submitAnswer, children: "Submit" })] })) : (_jsx("button", { type: "button", className: "button primary", onClick: proceed, children: questionIndex === roundQuestions.length - 1 ? 'Finish Round' : 'Next Question' })) }), hintVisible ? _jsxs("p", { className: "hint", children: ["Hint: ", questionHint(currentDimension, activeUnit)] }) : null, inputError ? _jsx("p", { className: "error-text", children: inputError }) : null, submittedResult ? (_jsxs("section", { className: "feedback", children: [_jsxs("div", { className: "feedback-row", children: [_jsx("span", { className: scoreChipClass(submittedResult.finalScore), children: submittedResult.finalScore }), _jsx("p", { children: submittedResult.feedback })] }), _jsxs("p", { children: [_jsx("strong", { children: "Your answer:" }), " ", submittedResult.guessLabel] }), _jsxs("p", { children: [_jsx("strong", { children: "Correct answer:" }), " ", submittedResult.answerLabel] }), submittedResult.detail ? _jsx("p", { children: submittedResult.detail }) : null, submittedResult.hintUsed ? _jsx("p", { className: "penalty-note", children: "Hint penalty applied: -15 points." }) : null] })) : null] })) : null, phase === 'summary' && summary ? (_jsxs(_Fragment, { children: [_jsxs("p", { className: "eyebrow", children: ["Round Summary \u00B7 ", scopeLabel(summary.scope)] }), _jsxs("h2", { children: [summary.unitsUsed, " Units"] }), _jsxs("p", { children: ["Round score: ", _jsx("strong", { children: formatPercent(summary.averageScore) })] }), _jsx("ul", { className: "result-list", children: summary.results.map((item, index) => {
                                            const question = summary.questions[index];
                                            return (_jsxs("li", { children: [_jsxs("span", { children: [dimensionLabel(item.dimension), " \u00B7 ", question?.unit.name ?? 'Unknown'] }), _jsx("span", { className: scoreChipClass(item.finalScore), children: item.finalScore })] }, `${item.dimension}-${question?.unit.id ?? 'unknown'}-${index}`));
                                        }) }), _jsxs("div", { className: "actions-row", children: [_jsx("button", { type: "button", className: "button primary", onClick: startRound, children: "New Round" }), _jsx("button", { type: "button", className: "button secondary", onClick: resetToIntro, children: "Change Scope" })] })] })) : null] }), _jsxs("aside", { className: "card side-card", children: [_jsx("h3", { children: "Progress Tracking" }), _jsx("p", { children: bestDim
                                    ? `Strongest dimension: ${dimensionLabel(bestDim.dimension)} (${formatPercent(bestDim.avg)} avg)`
                                    : 'No attempts yet.' }), _jsx("ul", { className: "dimension-list", children: dimensionAverages.map((item) => (_jsxs("li", { children: [_jsxs("div", { children: [_jsx("strong", { children: dimensionLabel(item.dimension) }), _jsxs("span", { children: [item.attempts, " attempts"] })] }), _jsx("div", { children: formatPercent(item.average) })] }, item.dimension))) }), _jsx("h3", { children: "Data Note" }), _jsx("p", { children: activeRegistry.dataNote }), _jsxs("p", { children: ["Boundaries: ", activeRegistry.boundaryModel, _jsx("br", {}), "Units loaded: ", activeRegistry.units.length] }), activeUnit && phase === 'quiz' ? (_jsxs("p", { children: ["Current unit metrics:", _jsx("br", {}), !hidePopulationMetric ? (_jsxs(_Fragment, { children: ["Population (", activeUnit.population.refDate, "): ", formatNumber(activeUnit.population.value), _jsx("br", {})] })) : null, !hideAreaMetric ? (_jsxs(_Fragment, { children: ["Area (", activeUnit.areaKm2.refDate, "): ", formatNumber(activeUnit.areaKm2.value), " km\u00B2"] })) : null] })) : null] })] })] }));
};
export default App;
