const EARTH_RADIUS_KM = 6371;
const forEachRing = (geometry, onRing) => {
    if (geometry.type === 'Polygon') {
        geometry.coordinates.forEach((ring) => onRing(ring));
        return;
    }
    geometry.coordinates.forEach((polygon) => {
        polygon.forEach((ring) => onRing(ring));
    });
};
export const projectEquirectangular = (point, width, height) => {
    const [lng, lat] = point;
    return {
        x: ((lng + 180) / 360) * width,
        y: ((90 - lat) / 180) * height,
    };
};
export const inverseProjectEquirectangular = (x, y, width, height) => ({
    lng: (x / width) * 360 - 180,
    lat: 90 - (y / height) * 180,
});
export const geometryToWorldPath = (geometry, width, height) => {
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
export const geometryBounds = (geometry) => {
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
export const geometriesBounds = (geometries) => {
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
const ringArea = (ring) => {
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
const geometryForOutlinePreview = (geometry) => {
    if (geometry.type === 'Polygon') {
        return geometry;
    }
    const polygons = geometry.coordinates;
    if (polygons.length === 0) {
        return geometry;
    }
    let best = polygons[0];
    let bestArea = ringArea((polygons[0][0] ?? []));
    polygons.forEach((polygon) => {
        const area = ringArea((polygon[0] ?? []));
        if (area > bestArea) {
            best = polygon;
            bestArea = area;
        }
    });
    return {
        type: 'Polygon',
        coordinates: best,
    };
};
const useWrappedLongitudeFit = (geometry) => {
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
const normalizeLongitude = (lng, wrap) => (wrap && lng < 0 ? lng + 360 : lng);
export const geometryToFittedPath = (geometry, width, height, padding = 16) => {
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
export const haversineDistanceKm = (a, b) => {
    const toRadians = (value) => (value * Math.PI) / 180;
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    return EARTH_RADIUS_KM * c;
};
const pointOnSegment = (px, py, x1, y1, x2, y2, epsilon = 1e-9) => {
    const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1);
    if (Math.abs(cross) > epsilon) {
        return false;
    }
    const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
    return dot <= epsilon;
};
const ringContainsPoint = (ring, pointLng, pointLat, mapLng) => {
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
const polygonContainsPoint = (polygon, pointLng, pointLat, mapLng) => {
    const rings = polygon;
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
export const isPointInsideGeometry = (point, geometry) => {
    const polygons = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates;
    const transforms = [
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
const toPlanarKm = (lng, lat, refLatRad) => ({
    x: (lng * Math.PI * EARTH_RADIUS_KM * Math.cos(refLatRad)) / 180,
    y: (lat * Math.PI * EARTH_RADIUS_KM) / 180,
});
const distanceToSegmentKm = (point, a, b) => {
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
export const distanceToGeometryKm = (point, geometry) => {
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
