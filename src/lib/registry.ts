import { sampleChinaRegistry } from '../data/sample-china-registry';
import { sampleWorldRegistry } from '../data/sample-world-registry';
import { GeoRegistryBundle, GeoScope, GeoUnitRecord, RegionGeometry } from '../types';

type WorldCountryRaw = {
  iso3: string;
  name: string;
  aliases?: string[];
  continent?: string;
  capital: string;
  capitalAliases?: string[];
  centroid: { lat: number; lng: number };
  population: { value: number; year: number };
  area: { value: number; year: number };
  geometry: RegionGeometry;
};

type WorldBundleRaw = {
  version: string;
  generatedAt: string;
  boundaryModel: string;
  dataNote: string;
  source?: Record<string, string>;
  countries: WorldCountryRaw[];
};

type ProvinceRaw = {
  divisionId: string;
  isoCode: string;
  nameEn: string;
  nameZh?: string;
  type: string;
  regionHint: string;
  aliases?: string[];
  capitalPrimary: string;
  capitalAliases?: string[];
  centroid: { lat: number; lng: number };
  labelPoint?: { lat: number; lng: number };
  population: { value: number; refDate: string; source?: string };
  areaKm2: { value: number; refDate: string; source?: string };
  geometry: RegionGeometry;
};

type ChinaBundleRaw = {
  version: string;
  generatedAt: string;
  boundaryModel: string;
  dataNote: string;
  referenceYear?: number;
  source?: Record<string, string>;
  divisions: ProvinceRaw[];
};

const hasGeometry = (geometry: RegionGeometry | undefined): geometry is RegionGeometry =>
  Boolean(geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon'));

const isFinitePoint = (point: { lat: number; lng: number } | undefined): point is { lat: number; lng: number } =>
  Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng));

const normalizeWorld = (bundle: WorldBundleRaw): GeoRegistryBundle => {
  const units: GeoUnitRecord[] = (bundle.countries ?? [])
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

const normalizeChina = (bundle: ChinaBundleRaw): GeoRegistryBundle => {
  const units: GeoUnitRecord[] = (bundle.divisions ?? [])
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

const fetchJson = async <T,>(path: string): Promise<T | null> => {
  try {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const loadRegistries = async (): Promise<Record<GeoScope, GeoRegistryBundle>> => {
  const worldRegistryUrl = import.meta.env.VITE_COUNTRY_REGISTRY_URL || '/data/country-registry.json';
  const chinaRegistryUrl = import.meta.env.VITE_CHINA_REGISTRY_URL || '/data/prc-province-registry.json';

  const [worldRaw, chinaRaw] = await Promise.all([
    fetchJson<WorldBundleRaw>(worldRegistryUrl),
    fetchJson<ChinaBundleRaw>(chinaRegistryUrl),
  ]);

  return {
    world: worldRaw ? normalizeWorld(worldRaw) : sampleWorldRegistry,
    china: chinaRaw ? normalizeChina(chinaRaw) : sampleChinaRegistry,
  };
};
