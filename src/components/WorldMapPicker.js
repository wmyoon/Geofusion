import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef } from 'react';
import { geometriesBounds } from '../lib/geo';
const MAP_WIDTH = 720;
const MAP_HEIGHT = 460;
const MOVE_STEP = 0.35;
const LABEL_FONT_SIZE = 10;
const LABEL_HEIGHT = 16;
const LABEL_MARGIN = 6;
const CJK_CHAR_REGEX = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const withPadding = (bounds) => ({
    minLng: bounds.minLng - 1.5,
    maxLng: bounds.maxLng + 1.5,
    minLat: bounds.minLat - 1.5,
    maxLat: bounds.maxLat + 1.5,
});
const project = (point, bounds) => {
    const width = Math.max(1e-8, bounds.maxLng - bounds.minLng);
    const height = Math.max(1e-8, bounds.maxLat - bounds.minLat);
    return {
        x: ((point.lng - bounds.minLng) / width) * MAP_WIDTH,
        y: ((bounds.maxLat - point.lat) / height) * MAP_HEIGHT,
    };
};
const inverseProject = (x, y, bounds) => {
    const width = Math.max(1e-8, bounds.maxLng - bounds.minLng);
    const height = Math.max(1e-8, bounds.maxLat - bounds.minLat);
    return {
        lng: bounds.minLng + (x / MAP_WIDTH) * width,
        lat: bounds.maxLat - (y / MAP_HEIGHT) * height,
    };
};
const estimateLabelWidth = (label) => {
    const width = Array.from(label).reduce((sum, char) => {
        if (CJK_CHAR_REGEX.test(char)) {
            return sum + LABEL_FONT_SIZE * 0.95;
        }
        return sum + LABEL_FONT_SIZE * 0.62;
    }, 0);
    return Math.max(28, width + 12);
};
const labelRect = (x, y, width, height) => ({
    left: x - width / 2,
    right: x + width / 2,
    top: y - height / 2,
    bottom: y + height / 2,
});
const clampLabelCenter = (x, y, width, height) => ({
    x: clamp(x, LABEL_MARGIN + width / 2, MAP_WIDTH - LABEL_MARGIN - width / 2),
    y: clamp(y, LABEL_MARGIN + height / 2, MAP_HEIGHT - LABEL_MARGIN - height / 2),
});
const overlapArea = (left, right) => {
    const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
    const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);
    if (overlapWidth <= 0 || overlapHeight <= 0) {
        return 0;
    }
    return overlapWidth * overlapHeight;
};
const labelOffsetMultipliers = (() => {
    const values = [{ dx: 0, dy: 0 }];
    const maxRing = 4;
    for (let ring = 1; ring <= maxRing; ring += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
            for (let dy = -ring; dy <= ring; dy += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) {
                    continue;
                }
                values.push({ dx, dy });
            }
        }
    }
    return values.sort((left, right) => {
        const leftDistance = Math.abs(left.dx) + Math.abs(left.dy);
        const rightDistance = Math.abs(right.dx) + Math.abs(right.dy);
        return leftDistance - rightDistance;
    });
})();
const resolveLabelPlacements = (units, bounds, unitLabelAccessor) => {
    const requested = units
        .map((unit) => {
        const label = unitLabelAccessor(unit)?.trim() ?? '';
        if (!label) {
            return null;
        }
        const anchor = project(unit.labelPoint, bounds);
        return {
            unitId: unit.id,
            label,
            anchorX: anchor.x,
            anchorY: anchor.y,
            width: estimateLabelWidth(label),
            height: LABEL_HEIGHT,
        };
    })
        .filter((item) => Boolean(item))
        .sort((left, right) => right.label.length - left.label.length || left.anchorY - right.anchorY);
    const occupiedRects = [];
    const byId = new Map();
    requested.forEach((item) => {
        const stepX = Math.max(14, item.width * 0.55);
        const stepY = Math.max(12, item.height * 1.2);
        let best = null;
        for (const { dx, dy } of labelOffsetMultipliers) {
            const candidateX = item.anchorX + dx * stepX;
            const candidateY = item.anchorY + dy * stepY;
            const clamped = clampLabelCenter(candidateX, candidateY, item.width, item.height);
            const rect = labelRect(clamped.x, clamped.y, item.width, item.height);
            const totalOverlap = occupiedRects.reduce((sum, existing) => sum + overlapArea(rect, existing), 0);
            const anchorDistance = Math.hypot(clamped.x - item.anchorX, clamped.y - item.anchorY);
            const clampDistance = Math.hypot(clamped.x - candidateX, clamped.y - candidateY);
            const score = totalOverlap * 1200 + anchorDistance + clampDistance * 6;
            if (!best || score < best.score) {
                best = { x: clamped.x, y: clamped.y, score, overlap: totalOverlap };
            }
        }
        if (!best) {
            return;
        }
        const finalRect = labelRect(best.x, best.y, item.width, item.height);
        occupiedRects.push(finalRect);
        byId.set(item.unitId, {
            unitId: item.unitId,
            label: item.label,
            x: best.x,
            y: best.y,
            anchorX: item.anchorX,
            anchorY: item.anchorY,
            drawLeader: Math.hypot(best.x - item.anchorX, best.y - item.anchorY) >= 10 || best.overlap > 0,
        });
    });
    const unitOrder = new Map(units.map((unit, index) => [unit.id, index]));
    return [...byId.values()].sort((left, right) => (unitOrder.get(left.unitId) ?? 0) - (unitOrder.get(right.unitId) ?? 0));
};
const geometryToPath = (geometry, bounds) => {
    const polygons = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.coordinates;
    let path = '';
    polygons.forEach((polygon) => {
        polygon.forEach((ring) => {
            ring.forEach(([lng, lat], index) => {
                const { x, y } = project({ lng, lat }, bounds);
                path += `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `;
            });
            path += 'Z ';
        });
    });
    return path.trim();
};
export const WorldMapPicker = ({ units, selectedPoint, onSelect, targetPoint, revealTarget = false, highlightUnitId, ariaLabel = 'Map picker. Click to place a pin. Arrow keys move the pin.', interactive = true, helpText = 'Tap map or use arrow keys to place your guess.', showUnitLabels = false, unitLabelAccessor = (unit) => unit.nameLocal ?? unit.name, }) => {
    const svgRef = useRef(null);
    const bounds = useMemo(() => {
        const raw = geometriesBounds(units.map((item) => item.geometry));
        return withPadding(raw);
    }, [units]);
    const mapPaths = useMemo(() => units.map((unit) => ({
        unitId: unit.id,
        path: geometryToPath(unit.geometry, bounds),
    })), [units, bounds]);
    const mapLabels = useMemo(() => showUnitLabels
        ? resolveLabelPlacements(units, bounds, unitLabelAccessor)
        : [], [units, bounds, showUnitLabels, unitLabelAccessor]);
    const selectedXY = selectedPoint ? project(selectedPoint, bounds) : null;
    const targetXY = revealTarget && targetPoint ? project(targetPoint, bounds) : null;
    const onMapClick = (event) => {
        if (!svgRef.current) {
            return;
        }
        const rect = svgRef.current.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
        const y = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
        onSelect(inverseProject(x, y, bounds));
    };
    const onMapKeyDown = (event) => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            return;
        }
        event.preventDefault();
        const base = selectedPoint ?? {
            lat: (bounds.minLat + bounds.maxLat) / 2,
            lng: (bounds.minLng + bounds.maxLng) / 2,
        };
        const next = { ...base };
        if (event.key === 'ArrowUp') {
            next.lat = clamp(next.lat + MOVE_STEP, bounds.minLat, bounds.maxLat);
        }
        if (event.key === 'ArrowDown') {
            next.lat = clamp(next.lat - MOVE_STEP, bounds.minLat, bounds.maxLat);
        }
        if (event.key === 'ArrowLeft') {
            next.lng = clamp(next.lng - MOVE_STEP, bounds.minLng, bounds.maxLng);
        }
        if (event.key === 'ArrowRight') {
            next.lng = clamp(next.lng + MOVE_STEP, bounds.minLng, bounds.maxLng);
        }
        onSelect(next);
    };
    const latLines = 8;
    const lonLines = 10;
    return (_jsxs("div", { className: "world-map-wrap", children: [_jsxs("svg", { ref: svgRef, className: "world-map", viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`, role: interactive ? 'application' : 'img', tabIndex: interactive ? 0 : -1, "aria-label": ariaLabel, onClick: interactive ? onMapClick : undefined, onKeyDown: interactive ? onMapKeyDown : undefined, children: [_jsx("rect", { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT, className: "ocean" }), Array.from({ length: latLines + 1 }).map((_, index) => {
                        const y = (index / latLines) * MAP_HEIGHT;
                        return _jsx("line", { x1: 0, y1: y, x2: MAP_WIDTH, y2: y, className: "graticule" }, `lat-${index}`);
                    }), Array.from({ length: lonLines + 1 }).map((_, index) => {
                        const x = (index / lonLines) * MAP_WIDTH;
                        return _jsx("line", { x1: x, y1: 0, x2: x, y2: MAP_HEIGHT, className: "graticule" }, `lon-${index}`);
                    }), _jsx("g", { fillRule: "evenodd", children: mapPaths.map((item) => (_jsx("path", { d: item.path, className: item.unitId === highlightUnitId ? 'country-shape highlight' : 'country-shape' }, item.unitId))) }), mapLabels.length > 0 ? (_jsxs("g", { className: "map-label-layer", "aria-hidden": "true", children: [mapLabels.map((item) => item.drawLeader ? (_jsx("line", { x1: item.anchorX, y1: item.anchorY, x2: item.x, y2: item.y, className: "map-unit-label-line" }, `leader-${item.unitId}`)) : null), mapLabels.map((item) => (_jsx("text", { x: item.x, y: item.y, textAnchor: "middle", dominantBaseline: "central", className: "map-unit-label", children: item.label }, `label-${item.unitId}`)))] })) : null, selectedXY ? (_jsxs("g", { className: "marker guess-marker", transform: `translate(${selectedXY.x}, ${selectedXY.y})`, children: [_jsx("circle", { r: 8 }), _jsx("circle", { r: 2.8 })] })) : null, targetXY ? (_jsxs("g", { className: "marker target-marker", transform: `translate(${targetXY.x}, ${targetXY.y})`, children: [_jsx("circle", { r: 8 }), _jsx("circle", { r: 2.5 })] })) : null] }), _jsx("p", { className: "map-help", children: helpText })] }));
};
