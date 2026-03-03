const compact = (value) => value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const normalizeGuess = (value) => compact(value);
export const equalsAlias = (guess, aliases) => {
    const normalizedGuess = compact(guess);
    return aliases.some((item) => compact(item) === normalizedGuess);
};
export const levenshtein = (a, b) => {
    if (a === b) {
        return 0;
    }
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 0; i < rows; i += 1) {
        matrix[i][0] = i;
    }
    for (let j = 0; j < cols; j += 1) {
        matrix[0][j] = j;
    }
    for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[rows - 1][cols - 1];
};
export const similarityScore = (left, right) => {
    const a = compact(left);
    const b = compact(right);
    if (a.length === 0 || b.length === 0) {
        return 0;
    }
    const distance = levenshtein(a, b);
    return 1 - distance / Math.max(a.length, b.length);
};
export const parseHumanNumber = (value) => {
    const prepared = value
        .normalize('NFKC')
        .toLowerCase()
        .replace(/,/g, '')
        .replace(/\s+/g, '')
        .replace(/people/g, '')
        .replace(/km2|km\^2|sqkm|sq\.km|平方米|平方公里/g, '')
        .replace(/million/g, 'm')
        .replace(/billion/g, 'b')
        .replace(/thousand/g, 'k');
    const hasYi = prepared.endsWith('亿');
    const hasWan = prepared.endsWith('万');
    const normalized = prepared.replace(/[亿万]/g, '');
    const match = normalized.match(/^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)([kmb])?$/i);
    if (!match) {
        return null;
    }
    const base = Number.parseFloat(match[1]);
    if (Number.isNaN(base)) {
        return null;
    }
    const suffix = match[2]?.toLowerCase();
    let multiplier = 1;
    if (suffix === 'k') {
        multiplier = 1000;
    }
    if (suffix === 'm') {
        multiplier = 1000000;
    }
    if (suffix === 'b') {
        multiplier = 1000000000;
    }
    if (hasWan) {
        multiplier *= 10000;
    }
    if (hasYi) {
        multiplier *= 100000000;
    }
    return base * multiplier;
};
export const formatCompact = (value) => {
    if (Math.abs(value) >= 1000000000) {
        return `${(value / 1000000000).toFixed(2)}B`;
    }
    if (Math.abs(value) >= 1000000) {
        return `${(value / 1000000).toFixed(2)}M`;
    }
    if (Math.abs(value) >= 1000) {
        return `${(value / 1000).toFixed(2)}K`;
    }
    return value.toFixed(0);
};
export const formatNumber = (value) => new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
}).format(value);
