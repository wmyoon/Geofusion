import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WB_OFFICIAL_BOUNDARIES_VERSION = '5';
const WB_OFFICIAL_BOUNDARIES_DATASET_ID = '0038272';
const WB_OFFICIAL_BOUNDARIES_GEOJSON_RESOURCE_ID = 'DR0095369';
const WB_OFFICIAL_BOUNDARIES_GEOJSON_FOLDER = 'World Bank Official Boundaries (GeoJSON)';
const WB_OFFICIAL_BOUNDARIES_ADMIN1_FILE = 'World Bank Official Boundaries - Admin 1.geojson';
const WB_OFFICIAL_BOUNDARIES_RESOURCE_LIST_URL = `https://ddh-openapi.worldbank.org/resources/${WB_OFFICIAL_BOUNDARIES_GEOJSON_RESOURCE_ID}/list?version=${WB_OFFICIAL_BOUNDARIES_VERSION}`;
const NBS_POPULATION_URL = 'https://www.stats.gov.cn/english/PressRelease/202105/t20210510_1817188.html';
const HK_CSD_POP_MDT_URL = 'https://www.censtatd.gov.hk/data/MDT_76_110-01001_POP_Raw_K_1dp_per_n.csv';
const HK_CSD_POP_TABLE_URL = 'https://www.censtatd.gov.hk/en/web_table.html?id=110-01001';
const MACAU_DSEC_POP_SOURCE_URL = 'https://www.dsec.gov.mo/en-US/Statistic?id=1';
const TAIWAN_MOI_POP_SOURCE_URL = 'https://www.ris.gov.tw/app/portal/346';
const MAINLAND_AREA_SOURCE_URL = 'https://www.stats.gov.cn/sj/ndsj/2024/indexch.htm';
const HK_AREA_SOURCE_URL = 'https://www.gov.hk/en/about/abouthk/facts.htm';
const MACAU_AREA_SOURCE_URL = 'https://www.dsec.gov.mo/en-US/Statistic?id=1';
const TAIWAN_AREA_SOURCE_URL = 'https://www.land.moi.gov.tw/chhtml/content/68?mcid=3224';

const filePath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(filePath);
const projectRoot = path.resolve(scriptDir, '..');
const outputFile = path.join(projectRoot, 'public', 'data', 'prc-province-registry.json');

const encodePathSegments = (value) => value.split('/').map((part) => encodeURIComponent(part)).join('/');
const wbAdmin1GeoJsonRelativePath = `${WB_OFFICIAL_BOUNDARIES_GEOJSON_FOLDER}/${WB_OFFICIAL_BOUNDARIES_ADMIN1_FILE}`;
const wbAdmin1GeoJsonDownloadUrl = `https://datacatalogfiles.worldbank.org/ddh-published-v2/${WB_OFFICIAL_BOUNDARIES_DATASET_ID}/${WB_OFFICIAL_BOUNDARIES_VERSION}/${WB_OFFICIAL_BOUNDARIES_GEOJSON_RESOURCE_ID}/${encodePathSegments(wbAdmin1GeoJsonRelativePath)}`;

const WB_ADM1_CODE_TO_DIVISION_ID = {
  CHN001: 'CN-AH',
  CHN002: 'CN-BJ',
  CHN003: 'CN-CQ',
  CHN004: 'CN-FJ',
  CHN005: 'CN-GS',
  CHN006: 'CN-GD',
  CHN007: 'CN-GX',
  CHN008: 'CN-GZ',
  CHN009: 'CN-HI',
  CHN010: 'CN-HE',
  CHN011: 'CN-HL',
  CHN012: 'CN-HA',
  CHN013: 'CN-HB',
  CHN014: 'CN-HN',
  CHN015: 'CN-JS',
  CHN016: 'CN-JX',
  CHN017: 'CN-JL',
  CHN018: 'CN-LN',
  CHN019: 'CN-NM',
  CHN020: 'CN-NX',
  CHN021: 'CN-QH',
  CHN022: 'CN-SN',
  CHN023: 'CN-SD',
  CHN024: 'CN-SH',
  CHN025: 'CN-SX',
  CHN026: 'CN-SC',
  CHN027: 'CN-TJ',
  CHN028: 'CN-XJ',
  CHN029: 'CN-XZ',
  CHN030: 'CN-YN',
  CHN031: 'CN-ZJ',
  HKG001: 'CN-HK',
  MAC001: 'CN-MO',
  TWN001: 'CN-TW',
};

const DIVISION_METADATA = {
  'CN-AH': {
    nameEn: 'Anhui',
    nameZh: '安徽省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Anhui Province', '安徽'],
    capitalPrimary: 'Hefei',
    capitalAliases: ['Hefei', '合肥'],
  },
  'CN-BJ': {
    nameEn: 'Beijing Municipality',
    nameZh: '北京市',
    type: 'municipality',
    regionHint: 'East',
    aliases: ['Beijing', '北京'],
    capitalPrimary: 'Beijing',
    capitalAliases: ['Beijing', '北京', 'Peking'],
  },
  'CN-CQ': {
    nameEn: 'Chongqing Municipality',
    nameZh: '重庆市',
    type: 'municipality',
    regionHint: 'West',
    aliases: ['Chongqing', '重庆'],
    capitalPrimary: 'Chongqing',
    capitalAliases: ['Chongqing', '重庆'],
  },
  'CN-FJ': {
    nameEn: 'Fujian',
    nameZh: '福建省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Fujian Province', '福建'],
    capitalPrimary: 'Fuzhou',
    capitalAliases: ['Fuzhou', '福州'],
  },
  'CN-GD': {
    nameEn: 'Guangdong',
    nameZh: '广东省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Guangdong Province', '广东'],
    capitalPrimary: 'Guangzhou',
    capitalAliases: ['Guangzhou', '广州', 'Canton'],
  },
  'CN-GS': {
    nameEn: 'Gansu',
    nameZh: '甘肃省',
    type: 'province',
    regionHint: 'West',
    aliases: ['Gansu Province', '甘肃'],
    capitalPrimary: 'Lanzhou',
    capitalAliases: ['Lanzhou', '兰州'],
  },
  'CN-GX': {
    nameEn: 'Guangxi Zhuang Autonomous Region',
    nameZh: '广西壮族自治区',
    type: 'autonomous_region',
    regionHint: 'West',
    aliases: ['Guangxi', '广西'],
    capitalPrimary: 'Nanning',
    capitalAliases: ['Nanning', '南宁'],
  },
  'CN-GZ': {
    nameEn: 'Guizhou',
    nameZh: '贵州省',
    type: 'province',
    regionHint: 'West',
    aliases: ['Guizhou Province', '贵州'],
    capitalPrimary: 'Guiyang',
    capitalAliases: ['Guiyang', '贵阳'],
  },
  'CN-HA': {
    nameEn: 'Henan',
    nameZh: '河南省',
    type: 'province',
    regionHint: 'Central',
    aliases: ['Henan Province', '河南'],
    capitalPrimary: 'Zhengzhou',
    capitalAliases: ['Zhengzhou', '郑州'],
  },
  'CN-HB': {
    nameEn: 'Hubei',
    nameZh: '湖北省',
    type: 'province',
    regionHint: 'Central',
    aliases: ['Hubei Province', '湖北'],
    capitalPrimary: 'Wuhan',
    capitalAliases: ['Wuhan', '武汉'],
  },
  'CN-HE': {
    nameEn: 'Hebei',
    nameZh: '河北省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Hebei Province', '河北'],
    capitalPrimary: 'Shijiazhuang',
    capitalAliases: ['Shijiazhuang', '石家庄'],
    labelPoint: { lat: 38.85, lng: 115.45 },
  },
  'CN-HI': {
    nameEn: 'Hainan',
    nameZh: '海南省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Hainan Province', '海南'],
    capitalPrimary: 'Haikou',
    capitalAliases: ['Haikou', '海口'],
  },
  'CN-HK': {
    nameEn: 'Hong Kong Special Administrative Region',
    nameZh: '香港特别行政区',
    type: 'sar',
    regionHint: 'East',
    aliases: ['Hong Kong', '香港', 'HK'],
    capitalPrimary: 'Hong Kong',
    capitalAliases: ['Hong Kong', 'Victoria', '香港'],
  },
  'CN-HL': {
    nameEn: 'Heilongjiang',
    nameZh: '黑龙江省',
    type: 'province',
    regionHint: 'Northeast',
    aliases: ['Heilongjiang Province', '黑龙江'],
    capitalPrimary: 'Harbin',
    capitalAliases: ['Harbin', '哈尔滨'],
  },
  'CN-HN': {
    nameEn: 'Hunan',
    nameZh: '湖南省',
    type: 'province',
    regionHint: 'Central',
    aliases: ['Hunan Province', '湖南'],
    capitalPrimary: 'Changsha',
    capitalAliases: ['Changsha', '长沙'],
  },
  'CN-JL': {
    nameEn: 'Jilin',
    nameZh: '吉林省',
    type: 'province',
    regionHint: 'Northeast',
    aliases: ['Jilin Province', '吉林'],
    capitalPrimary: 'Changchun',
    capitalAliases: ['Changchun', '长春'],
  },
  'CN-JS': {
    nameEn: 'Jiangsu',
    nameZh: '江苏省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Jiangsu Province', '江苏'],
    capitalPrimary: 'Nanjing',
    capitalAliases: ['Nanjing', '南京'],
  },
  'CN-JX': {
    nameEn: 'Jiangxi',
    nameZh: '江西省',
    type: 'province',
    regionHint: 'Central',
    aliases: ['Jiangxi Province', '江西'],
    capitalPrimary: 'Nanchang',
    capitalAliases: ['Nanchang', '南昌'],
  },
  'CN-LN': {
    nameEn: 'Liaoning',
    nameZh: '辽宁省',
    type: 'province',
    regionHint: 'Northeast',
    aliases: ['Liaoning Province', '辽宁'],
    capitalPrimary: 'Shenyang',
    capitalAliases: ['Shenyang', '沈阳'],
  },
  'CN-MO': {
    nameEn: 'Macau Special Administrative Region',
    nameZh: '澳门特别行政区',
    type: 'sar',
    regionHint: 'East',
    aliases: ['Macau', 'Macao', '澳门'],
    capitalPrimary: 'Macau',
    capitalAliases: ['Macau', 'Macao', '澳门'],
  },
  'CN-NM': {
    nameEn: 'Inner Mongolia Autonomous Region',
    nameZh: '内蒙古自治区',
    type: 'autonomous_region',
    regionHint: 'West',
    aliases: ['Inner Mongolia', 'Nei Mongol', '内蒙古'],
    capitalPrimary: 'Hohhot',
    capitalAliases: ['Hohhot', 'Huhehaote', '呼和浩特'],
  },
  'CN-NX': {
    nameEn: 'Ningxia Hui Autonomous Region',
    nameZh: '宁夏回族自治区',
    type: 'autonomous_region',
    regionHint: 'West',
    aliases: ['Ningxia', '宁夏'],
    capitalPrimary: 'Yinchuan',
    capitalAliases: ['Yinchuan', '银川'],
  },
  'CN-QH': {
    nameEn: 'Qinghai',
    nameZh: '青海省',
    type: 'province',
    regionHint: 'West',
    aliases: ['Qinghai Province', '青海'],
    capitalPrimary: 'Xining',
    capitalAliases: ['Xining', '西宁'],
  },
  'CN-SC': {
    nameEn: 'Sichuan',
    nameZh: '四川省',
    type: 'province',
    regionHint: 'West',
    aliases: ['Sichuan Province', '四川'],
    capitalPrimary: 'Chengdu',
    capitalAliases: ['Chengdu', '成都'],
  },
  'CN-SD': {
    nameEn: 'Shandong',
    nameZh: '山东省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Shandong Province', '山东'],
    capitalPrimary: 'Jinan',
    capitalAliases: ['Jinan', '济南'],
  },
  'CN-SH': {
    nameEn: 'Shanghai Municipality',
    nameZh: '上海市',
    type: 'municipality',
    regionHint: 'East',
    aliases: ['Shanghai', '上海'],
    capitalPrimary: 'Shanghai',
    capitalAliases: ['Shanghai', '上海'],
  },
  'CN-SN': {
    nameEn: 'Shaanxi',
    nameZh: '陕西省',
    type: 'province',
    regionHint: 'West',
    aliases: ['Shaanxi Province', '陕西'],
    capitalPrimary: "Xi'an",
    capitalAliases: ["Xi'an", 'Xian', '西安'],
  },
  'CN-SX': {
    nameEn: 'Shanxi',
    nameZh: '山西省',
    type: 'province',
    regionHint: 'Central',
    aliases: ['Shanxi Province', '山西'],
    capitalPrimary: 'Taiyuan',
    capitalAliases: ['Taiyuan', '太原'],
  },
  'CN-TJ': {
    nameEn: 'Tianjin Municipality',
    nameZh: '天津市',
    type: 'municipality',
    regionHint: 'East',
    aliases: ['Tianjin', '天津'],
    capitalPrimary: 'Tianjin',
    capitalAliases: ['Tianjin', '天津'],
  },
  'CN-TW': {
    nameEn: 'Taiwan Province',
    nameZh: '台湾省',
    type: 'taiwan',
    regionHint: 'East',
    aliases: ['Taiwan', '台湾', 'Republic of China (Taiwan)'],
    capitalPrimary: 'Taipei',
    capitalAliases: ['Taipei', 'Taibei', '台北', '臺北'],
  },
  'CN-XJ': {
    nameEn: 'Xinjiang Uyghur Autonomous Region',
    nameZh: '新疆维吾尔自治区',
    type: 'autonomous_region',
    regionHint: 'West',
    aliases: ['Xinjiang', '新疆'],
    capitalPrimary: 'Urumqi',
    capitalAliases: ['Urumqi', 'Ürümqi', '乌鲁木齐'],
  },
  'CN-XZ': {
    nameEn: 'Tibet Autonomous Region',
    nameZh: '西藏自治区',
    type: 'autonomous_region',
    regionHint: 'West',
    aliases: ['Tibet', 'Xizang', '西藏'],
    capitalPrimary: 'Lhasa',
    capitalAliases: ['Lhasa', '拉萨'],
  },
  'CN-YN': {
    nameEn: 'Yunnan',
    nameZh: '云南省',
    type: 'province',
    regionHint: 'West',
    aliases: ['Yunnan Province', '云南'],
    capitalPrimary: 'Kunming',
    capitalAliases: ['Kunming', '昆明'],
  },
  'CN-ZJ': {
    nameEn: 'Zhejiang',
    nameZh: '浙江省',
    type: 'province',
    regionHint: 'East',
    aliases: ['Zhejiang Province', '浙江'],
    capitalPrimary: 'Hangzhou',
    capitalAliases: ['Hangzhou', '杭州'],
  },
};

const NBS_MAINLAND_NAME_TO_DIVISION_ID = {
  Beijing: 'CN-BJ',
  Tianjin: 'CN-TJ',
  Hebei: 'CN-HE',
  Shanxi: 'CN-SX',
  'Inner Mongolia': 'CN-NM',
  Liaoning: 'CN-LN',
  Jilin: 'CN-JL',
  Heilongjiang: 'CN-HL',
  Shanghai: 'CN-SH',
  Jiangsu: 'CN-JS',
  Zhejiang: 'CN-ZJ',
  Anhui: 'CN-AH',
  Fujian: 'CN-FJ',
  Jiangxi: 'CN-JX',
  Shandong: 'CN-SD',
  Henan: 'CN-HA',
  Hubei: 'CN-HB',
  Hunan: 'CN-HN',
  Guangdong: 'CN-GD',
  Guangxi: 'CN-GX',
  Hainan: 'CN-HI',
  Chongqing: 'CN-CQ',
  Sichuan: 'CN-SC',
  Guizhou: 'CN-GZ',
  Yunnan: 'CN-YN',
  Tibet: 'CN-XZ',
  Shaanxi: 'CN-SN',
  Gansu: 'CN-GS',
  Qinghai: 'CN-QH',
  Ningxia: 'CN-NX',
  Xinjiang: 'CN-XJ',
};

const AREA_KM2_BY_DIVISION = {
  'CN-AH': 139879,
  'CN-BJ': 16411,
  'CN-CQ': 82403,
  'CN-FJ': 123756,
  'CN-GD': 180013,
  'CN-GS': 457382,
  'CN-GX': 237818,
  'CN-GZ': 176140,
  'CN-HA': 165467,
  'CN-HB': 185776,
  'CN-HE': 189809,
  'CN-HI': 34259,
  'CN-HK': 1108,
  'CN-HL': 472766,
  'CN-HN': 211842,
  'CN-JL': 190282,
  'CN-JS': 99949,
  'CN-JX': 166939,
  'CN-LN': 147076,
  'CN-MO': 29,
  'CN-NM': 1199372,
  'CN-NX': 66400,
  'CN-QH': 720000,
  'CN-SC': 484056,
  'CN-SD': 157704,
  'CN-SH': 6341,
  'CN-SN': 205624,
  'CN-SX': 156713,
  'CN-TJ': 11610,
  'CN-TW': 36161,
  'CN-XJ': 1644707,
  'CN-XZ': 1204776,
  'CN-YN': 383195,
  'CN-ZJ': 104873,
};

const NON_MAINLAND_POPULATION_FALLBACK = {
  'CN-HK': 7426700,
  'CN-MO': 683100,
  'CN-TW': 23162123,
};

const NON_MAINLAND_POPULATION_SOURCES = {
  'CN-HK': HK_CSD_POP_TABLE_URL,
  'CN-MO': MACAU_DSEC_POP_SOURCE_URL,
  'CN-TW': TAIWAN_MOI_POP_SOURCE_URL,
};

const NON_MAINLAND_AREA_SOURCES = {
  'CN-HK': HK_AREA_SOURCE_URL,
  'CN-MO': MACAU_AREA_SOURCE_URL,
  'CN-TW': TAIWAN_AREA_SOURCE_URL,
};

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.text();
};

const decodeHtml = (value) =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#160;/g, ' ')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-');

const cleanCell = (value) =>
  decodeHtml(
    value
      .replace(/<sup[\s\S]*?<\/sup>/g, '')
      .replace(/<span[^>]*>/g, '')
      .replace(/<\/span>/g, '')
      .replace(/<br\s*\/?>(\s*)/gi, ' ')
      .replace(/<a [^>]*>([\s\S]*?)<\/a>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );

const parseNbsMainlandPopulation = (html) => {
  const tableMatch = html.match(/<div class=\"TRS_PreAppend\"[\s\S]*?<table[\s\S]*?<\/table><\/div>/i);
  if (!tableMatch) {
    throw new Error('Could not find Table 3-1 in NBS population communiqué');
  }

  const rows = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
  const populationByDivisionId = new Map();

  rows.forEach((row) => {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cleanCell(match[1]));
    if (cells.length < 2) {
      return;
    }

    const regionName = cells[0];
    const populationRaw = cells[1];
    if (!/^\d{5,}$/.test(populationRaw)) {
      return;
    }

    const divisionId = NBS_MAINLAND_NAME_TO_DIVISION_ID[regionName];
    if (!divisionId) {
      return;
    }

    populationByDivisionId.set(divisionId, Number(populationRaw));
  });

  if (populationByDivisionId.size !== 31) {
    throw new Error(`NBS population parse incomplete: expected 31 mainland divisions, got ${populationByDivisionId.size}`);
  }

  return populationByDivisionId;
};

const parseHkYearEndPopulation = (csvText) => {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('C&SD population CSV is empty');
  }

  const headers = lines[0].split(',');
  const columnIndex = Object.fromEntries(headers.map((name, index) => [name, index]));

  const required = ['SEX', 'AGE', 'H', 'CCYY', 'obs_value'];
  required.forEach((column) => {
    if (columnIndex[column] === undefined) {
      throw new Error(`C&SD CSV missing expected column: ${column}`);
    }
  });

  for (let i = 1; i < lines.length; i += 1) {
    const row = lines[i].split(',');
    const sex = row[columnIndex.SEX] ?? '';
    const age = row[columnIndex.AGE] ?? '';
    const h = row[columnIndex.H] ?? '';
    const year = row[columnIndex.CCYY] ?? '';

    if (sex === '' && age === '' && h === '2' && year === '2020') {
      const valueInThousands = Number.parseFloat(row[columnIndex.obs_value] ?? '');
      if (!Number.isFinite(valueInThousands)) {
        break;
      }
      return Math.round(valueInThousands * 1000);
    }
  }

  throw new Error('Could not locate year-end 2020 Hong Kong population in C&SD CSV');
};

const centroidFromGeometry = (geometry) => {
  let lonTotal = 0;
  let latTotal = 0;
  let count = 0;

  const consumeRing = (ring) => {
    ring.forEach((point) => {
      const lon = Number(point?.[0]);
      const lat = Number(point?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return;
      }
      lonTotal += lon;
      latTotal += lat;
      count += 1;
    });
  };

  if (geometry?.type === 'Polygon') {
    geometry.coordinates.forEach(consumeRing);
  }

  if (geometry?.type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon) => polygon.forEach(consumeRing));
  }

  if (count === 0) {
    return { lat: 0, lng: 0 };
  }

  return {
    lat: Number((latTotal / count).toFixed(6)),
    lng: Number((lonTotal / count).toFixed(6)),
  };
};

const bboxFromGeometry = (geometry) => {
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const consumeRing = (ring) => {
    ring.forEach((point) => {
      const lon = Number(point?.[0]);
      const lat = Number(point?.[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return;
      }

      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    });
  };

  if (geometry?.type === 'Polygon') {
    geometry.coordinates.forEach(consumeRing);
  }

  if (geometry?.type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon) => polygon.forEach(consumeRing));
  }

  return {
    west: Number(west.toFixed(6)),
    south: Number(south.toFixed(6)),
    east: Number(east.toFixed(6)),
    north: Number(north.toFixed(6)),
  };
};

const dedupe = (items) => [...new Set(items.filter((item) => typeof item === 'string' && item.trim().length > 0))];

const build = async () => {
  const [resourceFileList, nbsPopulationHtml, hkPopulationCsv] = await Promise.all([
    fetchJson(WB_OFFICIAL_BOUNDARIES_RESOURCE_LIST_URL),
    fetchText(NBS_POPULATION_URL),
    fetchText(HK_CSD_POP_MDT_URL),
  ]);

  const mainlandPopulationByDivisionId = parseNbsMainlandPopulation(nbsPopulationHtml);
  const hkPopulationYearEnd2020 = parseHkYearEndPopulation(hkPopulationCsv);

  if (!Array.isArray(resourceFileList)) {
    throw new Error('World Bank resource list endpoint returned an unexpected payload');
  }

  const expectedResourcePath = `/${wbAdmin1GeoJsonRelativePath}`;
  if (!resourceFileList.includes(expectedResourcePath)) {
    throw new Error(
      `World Bank resource list does not include expected file: ${expectedResourcePath}. Available files: ${resourceFileList.join(', ')}`,
    );
  }

  const geometryPayload = await fetchJson(wbAdmin1GeoJsonDownloadUrl);
  const features = Array.isArray(geometryPayload?.features) ? geometryPayload.features : [];

  const missing = [];
  const divisions = [];
  const seenDivisionIds = new Set();

  features.forEach((feature) => {
    const wbAdm1Code = feature?.properties?.ADM1CD_c;
    const wbName = feature?.properties?.NAM_1;
    const divisionId = WB_ADM1_CODE_TO_DIVISION_ID[wbAdm1Code];

    if (!divisionId) {
      return;
    }

    const metadata = DIVISION_METADATA[divisionId];
    const geometry = feature?.geometry;

    if (!metadata) {
      missing.push(`No metadata entry for ${divisionId}`);
      return;
    }

    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      missing.push(`Invalid geometry for ${divisionId}`);
      return;
    }

    const centroid = centroidFromGeometry(geometry);
    const bbox = bboxFromGeometry(geometry);

    const aliases = dedupe([
      metadata.nameEn,
      wbName,
      ...metadata.aliases,
      divisionId,
      wbAdm1Code,
    ]).filter((alias) => alias !== metadata.nameEn);

    const capitalPrimary = metadata.capitalPrimary;
    const capitalAliases = dedupe([capitalPrimary, ...metadata.capitalAliases]).filter(
      (alias) => alias !== capitalPrimary,
    );

    const populationValue =
      mainlandPopulationByDivisionId.get(divisionId) ??
      (divisionId === 'CN-HK' ? hkPopulationYearEnd2020 : NON_MAINLAND_POPULATION_FALLBACK[divisionId]);

    if (!Number.isFinite(populationValue)) {
      missing.push(`No population value for ${divisionId}`);
      return;
    }

    const areaValue = AREA_KM2_BY_DIVISION[divisionId];
    if (!Number.isFinite(areaValue)) {
      missing.push(`No area value for ${divisionId}`);
      return;
    }

    const populationRefDate = mainlandPopulationByDivisionId.has(divisionId) ? '2020-11-01' : '2020-12-31';
    const populationSource = mainlandPopulationByDivisionId.has(divisionId)
      ? NBS_POPULATION_URL
      : NON_MAINLAND_POPULATION_SOURCES[divisionId];

    const areaRefDate = divisionId === 'CN-MO' ? '2025-12-31' : '2020-12-31';
    const areaSource = NON_MAINLAND_AREA_SOURCES[divisionId] ?? MAINLAND_AREA_SOURCE_URL;

    divisions.push({
      divisionId,
      isoCode: divisionId,
      nameEn: metadata.nameEn,
      nameZh: metadata.nameZh,
      type: metadata.type,
      regionHint: metadata.regionHint,
      aliases,
      capitalPrimary,
      capitalAliases,
      centroid,
      bbox,
      // Some divisions need a representative interior anchor instead of the raw centroid.
      labelPoint: metadata.labelPoint ?? centroid,
      population: {
        value: populationValue,
        refDate: populationRefDate,
        source: populationSource,
      },
      areaKm2: {
        value: areaValue,
        refDate: areaRefDate,
        source: areaSource,
      },
      geometry,
    });

    seenDivisionIds.add(divisionId);
  });

  Object.values(WB_ADM1_CODE_TO_DIVISION_ID).forEach((divisionId) => {
    if (!seenDivisionIds.has(divisionId)) {
      missing.push(`Missing geometry for ${divisionId} in World Bank Official Boundaries v${WB_OFFICIAL_BOUNDARIES_VERSION}`);
    }
  });

  if (missing.length > 0) {
    throw new Error(missing.join('\n'));
  }

  divisions.sort((a, b) => a.divisionId.localeCompare(b.divisionId));

  const bundle = {
    version: 'prc-adm1-2.0.0',
    generatedAt: new Date().toISOString(),
    boundaryModel: `World Bank Official Boundaries v${WB_OFFICIAL_BOUNDARIES_VERSION} (Admin 1 GeoJSON).`,
    dataNote:
      'Admin 1 geometry is sourced from World Bank Official Boundaries v5 and filtered to PRC provinces, municipalities, autonomous regions, SARs, and Taiwan in this build. Mainland population is parsed from NBS Census Communiqué No.3 (2020 reference point). HK/Macau/Taiwan population and area use direct official agency sources with curated joins. Mainland area is sourced from official NBS yearbook references and maintained as curated static values in this build script.',
    referenceYear: 2020,
    source: {
      geometry: wbAdmin1GeoJsonDownloadUrl,
      geometryList: WB_OFFICIAL_BOUNDARIES_RESOURCE_LIST_URL,
      facts: `${NBS_POPULATION_URL}; ${HK_CSD_POP_TABLE_URL}; ${MACAU_DSEC_POP_SOURCE_URL}; ${TAIWAN_MOI_POP_SOURCE_URL}`,
      population: `${NBS_POPULATION_URL}; ${HK_CSD_POP_TABLE_URL}; ${MACAU_DSEC_POP_SOURCE_URL}; ${TAIWAN_MOI_POP_SOURCE_URL}`,
      area: `${MAINLAND_AREA_SOURCE_URL}; ${HK_AREA_SOURCE_URL}; ${MACAU_AREA_SOURCE_URL}; ${TAIWAN_AREA_SOURCE_URL}`,
    },
    divisions,
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${divisions.length} divisions to ${outputFile}`);
};

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
