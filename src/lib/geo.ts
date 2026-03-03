import { Point, RegionGeometry } from '../types';

type LonLat = [number, number];

type Ring = LonLat[];

const EARTH_RADIUS_KM = 6371;

const forEachRing = (geometry: RegionGeometry, onRing: (ring: Ring) => void): void => {
  if (geometry.type === 'Polygon') {
    (geometry.coordinates as number[][][]).forEach((ring) => onRing(ring as Ring));
    return;
  }

  (geometry.coordinates as number[][][][]).forEach((polygon) => {
    polygon.forEach((ring) => onRing(ring as Ring));
  });
};

export const projectEquirectangular = (
  point: LonLat,
  width: number,
  height: number,
): { x: number; y: number } => {
  const [lng, lat] = point;
  return {
    x: ((lng + 180) / 360) * width,
    y: ((90 - lat) / 180) * height,
  };
};

export const inverseProjectEquirectangular = (
  x: number,
  y: number,
  width: number,
  height: number,
): Point => ({
  lng: (x / width) * 360 - 180,
  lat: 90 - (y / height) * 180,
});

export const geometryToWorldPath = (geometry: RegionGeometry, width: number, height: number): string => {
  let path = '';

  forEachRing(geometry, (ring) => {
    ring.forEach(([lng, lat], index) => {
      const { x, y } = projectEquirectangular([lng, lat], width, height);
      path += `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
    });
    path += 'Z ';
  });

  return path.trim();
};

export const geometryBounds = (geometry: RegionGeometry): { minLng: number; maxLng: number; minLat: number; maxLat: number } => {
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  forEachRing(geometry, (ring) => {
    ring.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
  });

  return { minLng, maxLng, minLat, maxLat };
};

export const geometriesBounds = (geometries: RegionGeometry[]): { minLng: number; maxLng: number; minLat: number; maxLat: number } => {
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  geometries.forEach((geometry) => {
    const bounds = geometryBounds(geometry);
    minLng = Math.min(minLng, bounds.minLng);
    maxLng = Math.max(maxLng, bounds.maxLng);
    minLat = Math.min(minLat, bounds.minLat);
    maxLat = Math.max(maxLat, bounds.maxLat);
  });

  return { minLng, maxLng, minLat, maxLat };
};

const ringArea = (ring: Ring): number => {
  if (ring.length < 3) {
    return 0;
  }

  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }

  return Math.abs(sum / 2);
};

const geometryForOutlinePreview = (geometry: RegionGeometry): RegionGeometry => {
  if (geometry.type === 'Polygon') {
    return geometry;
  }

  const polygons = geometry.coordinates as number[][][][];
  if (polygons.length === 0) {
    return geometry;
  }

  let best = polygons[0];
  let bestArea = ringArea((polygons[0][0] ?? []) as Ring);

  polygons.forEach((polygon) => {
    const area = ringArea((polygon[0] ?? []) as Ring);
    if (area > bestArea) {
      best = polygon;
      bestArea = area;
    }
  });

  return {
    type: 'Polygon',
    coordinates: best as number[][][],
  };
};

const useWrappedLongitudeFit = (geometry: RegionGeometry): boolean => {
  const raw = geometryBounds(geometry);
  const rawSpan = raw.maxLng - raw.minLng;

  let wrappedMin = Number.POSITIVE_INFINITY;
  let wrappedMax = Number.NEGATIVE_INFINITY;

  forEachRing(geometry, (ring) => {
    ring.forEach(([lng]) => {
      const normalized = lng < 0 ? lng + 360 : lng;
      wrappedMin = Math.min(wrappedMin, normalized);
      wrappedMax = Math.max(wrappedMax, normalized);
    });
  });

  const wrappedSpan = wrappedMax - wrappedMin;
  return wrappedSpan + 1e-6 < rawSpan;
};

const normalizeLongitude = (lng: number, wrap: boolean): number => (wrap && lng < 0 ? lng + 360 : lng);

export const geometryToFittedPath = (
  geometry: RegionGeometry,
  width: number,
  height: number,
  padding = 16,
): string => {
  const previewGeometry = geometryForOutlinePreview(geometry);
  const wrapLongitudes = useWrappedLongitudeFit(previewGeometry);

  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  forEachRing(previewGeometry, (ring) => {
    ring.forEach(([lng, lat]) => {
      const normalizedLng = normalizeLongitude(lng, wrapLongitudes);
      minLng = Math.min(minLng, normalizedLng);
      maxLng = Math.max(maxLng, normalizedLng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    });
  });

  const bounds = { minLng, maxLng, minLat, maxLat };
  const dataWidth = Math.max(1e-8, bounds.maxLng - bounds.minLng);
  const dataHeight = Math.max(1e-8, bounds.maxLat - bounds.minLat);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);
  const xOffset = (width - dataWidth * scale) / 2;
  const yOffset = (height - dataHeight * scale) / 2;

  let path = '';

  forEachRing(previewGeometry, (ring) => {
    ring.forEach(([lng, lat], index) => {
      const normalizedLng = normalizeLongitude(lng, wrapLongitudes);
      const x = xOffset + (normalizedLng - bounds.minLng) * scale;
      const y = yOffset + (bounds.maxLat - lat) * scale;
      path += `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
    });
    path += 'Z ';
  });

  return path.trim();
};

export const haversineDistanceKm = (a: Point, b: Point): number => {
  const toRadians = (value: number): number => (value * Math.PI) / 180;

  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));

  return EARTH_RADIUS_KM * c;
};

const pointOnSegment = (
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  epsilon = 1e-9,
): boolean => {
  const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
  if (Math.abs(cross) > epsilon) {
    return false;
  }

  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= epsilon;
};

const ringContainsPoint = (
  ring: Ring,
  pointLng: number,
  pointLat: number,
  mapLng: (lng: number) => number,
): boolean => {
  if (ring.length < 3) {
    return false;
  }

  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const x1 = mapLng(ring[j][0]);
    const y1 = ring[j][1];
    const x2 = mapLng(ring[i][0]);
    const y2 = ring[i][1];

    if (pointOnSegment(pointLng, pointLat, x1, y1, x2, y2)) {
      return true;
    }

    const crossesRay = (y1 > pointLat) !== (y2 > pointLat);
    if (!crossesRay) {
      continue;
    }

    const xIntersect = ((x2 - x1) * (pointLat - y1)) / (y2 - y1) + x1;
    if (pointLng < xIntersect) {
      inside = !inside;
    }
  }

  return inside;
};

const polygonContainsPoint = (
  polygon: number[][][],
  pointLng: number,
  pointLat: number,
  mapLng: (lng: number) => number,
): boolean => {
  const rings = polygon as Ring[];
  if (rings.length === 0) {
    return false;
  }

  if (!ringContainsPoint(rings[0], pointLng, pointLat, mapLng)) {
    return false;
  }

  for (let i = 1; i < rings.length; i += 1) {
    if (ringContainsPoint(rings[i], pointLng, pointLat, mapLng)) {
      return false;
    }
  }

  return true;
};

export const isPointInsideGeometry = (point: Point, geometry: RegionGeometry): boolean => {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][]);

  const transforms: Array<(lng: number) => number> = [
    (lng) => lng,
    (lng) => (lng < 0 ? lng + 360 : lng),
    (lng) => (lng > 0 ? lng - 360 : lng),
  ];

  for (const transform of transforms) {
    const base = transform(point.lng);
    const pointLngCandidates = [base, base + 360, base - 360];

    for (const pointLng of pointLngCandidates) {
      for (const polygon of polygons) {
        if (polygonContainsPoint(polygon, pointLng, point.lat, transform)) {
          return true;
        }
      }
    }
  }

  return false;
};

// Backward-compatible export used by older modules.
export const isPointInsideCountryGeometry = isPointInsideGeometry;

const toPlanarKm = (lng: number, lat: number, refLatRad: number): { x: number; y: number } => ({
  x: (lng * Math.PI * EARTH_RADIUS_KM * Math.cos(refLatRad)) / 180,
  y: (lat * Math.PI * EARTH_RADIUS_KM) / 180,
});

const distanceToSegmentKm = (point: Point, a: LonLat, b: LonLat): number => {
  const refLatRad = (point.lat * Math.PI) / 180;

  const p = toPlanarKm(point.lng, point.lat, refLatRad);
  const p1 = toPlanarKm(a[0], a[1], refLatRad);
  const p2 = toPlanarKm(b[0], b[1], refLatRad);

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
    const ddx = p.x - p1.x;
    const ddy = p.y - p1.y;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (dx * dx + dy * dy)));
  const projX = p1.x + t * dx;
  const projY = p1.y + t * dy;

  const ddx = p.x - projX;
  const ddy = p.y - projY;
  return Math.sqrt(ddx * ddx + ddy * ddy);
};

export const distanceToGeometryKm = (point: Point, geometry: RegionGeometry): number => {
  let minDistance = Number.POSITIVE_INFINITY;

  forEachRing(geometry, (ring) => {
    if (ring.length === 0) {
      return;
    }

    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (!a || !b) {
        continue;
      }

      const distance = distanceToSegmentKm(point, a, b);
      minDistance = Math.min(minDistance, distance);
    }
  });

  return Number.isFinite(minDistance) ? minDistance : Number.POSITIVE_INFINITY;
};
