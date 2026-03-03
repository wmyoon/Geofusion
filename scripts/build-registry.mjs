import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATURAL_EARTH_URL =
  process.env.NATURAL_EARTH_URL ||
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';

const WORLD_BANK_COUNTRIES_URL =
  process.env.WB_COUNTRIES_URL || 'https://api.worldbank.org/v2/country?format=json&per_page=400';

const WORLD_BANK_POPULATION_URL =
  process.env.WB_POP_URL ||
  'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=20000';

const WORLD_BANK_AREA_URL =
  process.env.WB_AREA_URL ||
  'https://api.worldbank.org/v2/country/all/indicator/AG.SRF.TOTL.K2?format=json&per_page=20000';

const naturalEarthResolutionMatch = NATURAL_EARTH_URL.match(/ne_(\d+m)_admin_0_countries/i);
const naturalEarthResolution = naturalEarthResolutionMatch ? naturalEarthResolutionMatch[1] : 'custom';

const filePath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(filePath);
const projectRoot = path.resolve(scriptDir, '..');
const outputFile = path.join(projectRoot, 'public', 'data', 'country-registry.json');
const overridesFile = path.join(scriptDir, 'manual-overrides.json');

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
};

const safeNumber = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const centroidFromGeometry = (geometry) => {
  let lonTotal = 0;
  let latTotal = 0;
  let count = 0;

  const consumeRing = (ring) => {
    for (const point of ring) {
      const lon = safeNumber(point?.[0]);
      const lat = safeNumber(point?.[1]);
      if (lon === null || lat === null) {
        continue;
      }
      lonTotal += lon;
      latTotal += lat;
      count += 1;
    }
  };

  if (geometry?.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      consumeRing(ring);
    }
  }

  if (geometry?.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        consumeRing(ring);
      }
    }
  }

  if (count === 0) {
    return { lat: 0, lng: 0 };
  }

  return {
    lat: latTotal / count,
    lng: lonTotal / count,
  };
};

const latestIndicatorByIso3 = (rows) => {
  const map = new Map();

  for (const row of rows) {
    const iso3 = row.countryiso3code;
    const value = safeNumber(row.value);
    const year = Number.parseInt(row.date, 10);

    if (!iso3 || iso3.length !== 3 || value === null || Number.isNaN(year)) {
      continue;
    }

    const existing = map.get(iso3);
    if (!existing || year > existing.year) {
      map.set(iso3, { value, year });
    }
  }

  return map;
};

const getFeatureIso3 = (properties, overrides) => {
  const name = properties.NAME_EN || properties.NAME || properties.ADMIN || '';
  const byName = overrides.geometryIsoByName?.[name];
  if (typeof byName === 'string' && byName.length === 3) {
    return byName.toUpperCase();
  }

  const candidates = [
    properties.ADM0_A3,
    properties.ISO_A3_EH,
    properties.ISO_A3,
    properties.SOV_A3,
    properties.BRK_A3,
    properties.GU_A3,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const normalized = candidate.trim().toUpperCase();
    if (normalized.length === 3 && normalized !== '-99') {
      return normalized;
    }
  }

  return null;
};

const build = async () => {
  const overrides = JSON.parse(await fs.readFile(overridesFile, 'utf8'));

  const [naturalEarth, wbCountriesPayload, wbPopulationPayload, wbAreaPayload] = await Promise.all([
    fetchJson(NATURAL_EARTH_URL),
    fetchJson(WORLD_BANK_COUNTRIES_URL),
    fetchJson(WORLD_BANK_POPULATION_URL),
    fetchJson(WORLD_BANK_AREA_URL),
  ]);

  const wbCountries = Array.isArray(wbCountriesPayload?.[1]) ? wbCountriesPayload[1] : [];
  const wbPopulationRows = Array.isArray(wbPopulationPayload?.[1]) ? wbPopulationPayload[1] : [];
  const wbAreaRows = Array.isArray(wbAreaPayload?.[1]) ? wbAreaPayload[1] : [];

  const metadataByIso3 = new Map();
  for (const country of wbCountries) {
    const iso3 = (country?.id || '').toUpperCase();
    if (!iso3 || iso3.length !== 3) {
      continue;
    }

    metadataByIso3.set(iso3, {
      iso2: country.iso2Code,
      name: country.name,
      capital: country.capitalCity,
      lat: safeNumber(country.latitude),
      lng: safeNumber(country.longitude),
      continent: country.region?.value,
    });
  }

  const populationByIso3 = latestIndicatorByIso3(wbPopulationRows);
  const areaByIso3 = latestIndicatorByIso3(wbAreaRows);

  const missing = [];
  const countries = [];

  const features = Array.isArray(naturalEarth?.features) ? naturalEarth.features : [];
  for (const feature of features) {
    const geometry = feature?.geometry;
    const properties = feature?.properties ?? {};

    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      continue;
    }

    const iso3 = getFeatureIso3(properties, overrides);
    if (!iso3) {
      missing.push(properties.NAME_EN || properties.NAME || 'unknown-feature');
      continue;
    }

    const manual = overrides.countryOverrides?.[iso3] ?? {};
    const metadata = metadataByIso3.get(iso3);
    const population = populationByIso3.get(iso3) ?? manual.population ?? null;
    const area = areaByIso3.get(iso3) ?? manual.area ?? null;

    if (!population || !area) {
      continue;
    }

    const centroid =
      metadata?.lat !== null &&
      metadata?.lat !== undefined &&
      metadata?.lng !== null &&
      metadata?.lng !== undefined
        ? { lat: metadata.lat, lng: metadata.lng }
        : centroidFromGeometry(geometry);

    const name =
      manual.name || properties.NAME_EN || properties.NAME || metadata?.name || properties.ADMIN || iso3;
    const aliases = new Set([
      name,
      properties.NAME,
      properties.NAME_EN,
      properties.NAME_LONG,
      properties.FORMAL_EN,
      properties.BRK_NAME,
      metadata?.name,
      ...(manual.aliases ?? []),
    ]);

    const capital = manual.capital || metadata?.capital || '';
    if (!capital) {
      continue;
    }

    countries.push({
      iso3,
      iso2: metadata?.iso2 || undefined,
      name,
      aliases: [...aliases].filter((item) => typeof item === 'string' && item.trim().length > 0 && item !== name),
      continent: manual.continent || properties.CONTINENT || metadata?.continent || 'Unknown',
      capital,
      capitalAliases: (manual.capitalAliases ?? []).filter((item) => typeof item === 'string'),
      centroid,
      population,
      area,
      geometry,
    });
  }

  countries.sort((a, b) => a.name.localeCompare(b.name));

  const bundle = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    boundaryModel: `Natural Earth Admin 0 Countries (${naturalEarthResolution} resolution, de facto boundaries with POV variants available in source data).`,
    dataNote:
      'Boundaries follow Natural Earth de facto geometry. Population and area use latest non-null World Bank WDI values with per-country year shown in the quiz.',
    source: {
      naturalEarth: NATURAL_EARTH_URL,
      worldBankCountries: WORLD_BANK_COUNTRIES_URL,
      populationIndicator: WORLD_BANK_POPULATION_URL,
      areaIndicator: WORLD_BANK_AREA_URL,
    },
    missingIsoMappings: missing,
    countries,
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${countries.length} countries to ${outputFile}`);
  if (missing.length > 0) {
    console.log(`Unmapped features: ${missing.length}`);
  }
};

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
