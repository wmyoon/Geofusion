import { sampleChinaRegistry } from '../data/sample-china-registry';
import { sampleWorldRegistry } from '../data/sample-world-registry';
const hasGeometry = (geometry) => Boolean(geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon'));
const isFinitePoint = (point) => Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
const normalizeWorld = (bundle) => {
    const units = (bundle.countries ?? [])
        .filter((country) => country.iso3 && country.name && country.capital)
        .filter((country) => hasGeometry(country.geometry))
        .filter((country) => isFinitePoint(country.centroid))
        .filter((country) => Number.isFinite(country.population?.value) && Number.isFinite(country.area?.value))
        .map((country) => ({
        id: country.iso3,
        code: country.iso3,
        name: country.name,
        aliases: country.aliases ?? [],
        kind: 'country',
        regionHint: country.continent || 'Unknown',
        capitalPrimary: country.capital,
        capitalAliases: country.capitalAliases ?? [],
        centroid: country.centroid,
        labelPoint: country.centroid,
        population: {
            value: country.population.value,
            refDate: String(country.population.year),
        },
        areaKm2: {
            value: country.area.value,
            refDate: String(country.area.year),
        },
        geometry: country.geometry,
    }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return {
        scope: 'world',
        title: 'World Countries',
        version: bundle.version || 'unknown',
        generatedAt: bundle.generatedAt || new Date().toISOString(),
        boundaryModel: bundle.boundaryModel || 'Natural Earth Admin 0',
        dataNote: bundle.dataNote || 'World country registry.',
        referenceLabel: 'Latest available year per country',
        source: bundle.source ?? {},
        units,
    };
};
const normalizeChina = (bundle) => {
    const units = (bundle.divisions ?? [])
        .filter((division) => division.divisionId && division.nameEn && division.capitalPrimary)
        .filter((division) => hasGeometry(division.geometry))
        .filter((division) => isFinitePoint(division.centroid))
        .filter((division) => Number.isFinite(division.population?.value) && Number.isFinite(division.areaKm2?.value))
        .map((division) => ({
        id: division.divisionId,
        code: division.isoCode || division.divisionId,
        name: division.nameEn,
        nameLocal: division.nameZh,
        aliases: division.aliases ?? [],
        kind: division.type || 'province',
        regionHint: division.regionHint || 'China',
        capitalPrimary: division.capitalPrimary,
        capitalAliases: division.capitalAliases ?? [],
        centroid: division.centroid,
        labelPoint: division.labelPoint ?? division.centroid,
        population: division.population,
        areaKm2: division.areaKm2,
        geometry: division.geometry,
    }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return {
        scope: 'china',
        title: 'China Provinces',
        version: bundle.version || 'unknown',
        generatedAt: bundle.generatedAt || new Date().toISOString(),
        boundaryModel: bundle.boundaryModel || 'China ADM1',
        dataNote: bundle.dataNote || 'China province registry.',
        referenceLabel: bundle.referenceYear ? `Reference year ${bundle.referenceYear}` : 'Source-specific dates',
        source: bundle.source ?? {},
        units,
    };
};
const fetchJson = async (path) => {
    try {
        const response = await fetch(path, { cache: 'no-cache' });
        if (!response.ok) {
            return null;
        }
        return (await response.json());
    }
    catch {
        return null;
    }
};
export const loadRegistries = async () => {
    const [worldRaw, chinaRaw] = await Promise.all([
        fetchJson('/data/country-registry.json'),
        fetchJson('/data/prc-province-registry.json'),
    ]);
    return {
        world: worldRaw ? normalizeWorld(worldRaw) : sampleWorldRegistry,
        china: chinaRaw ? normalizeChina(chinaRaw) : sampleChinaRegistry,
    };
};
