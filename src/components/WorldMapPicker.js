import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useRef } from 'react';
import { geometriesBounds } from '../lib/geo';
const MAP_WIDTH = 720;
const MAP_HEIGHT = 460;
const MOVE_STEP = 0.35;
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
export const WorldMapPicker = ({ units, selectedPoint, onSelect, targetPoint, revealTarget = false, highlightUnitId, ariaLabel = 'Map picker. Click to place a pin. Arrow keys move the pin.', interactive = true, helpText = 'Tap map or use arrow keys to place your guess.', }) => {
    const svgRef = useRef(null);
    const bounds = useMemo(() => {
        const raw = geometriesBounds(units.map((item) => item.geometry));
        return withPadding(raw);
    }, [units]);
    const mapPaths = useMemo(() => units.map((unit) => ({
        unitId: unit.id,
        path: geometryToPath(unit.geometry, bounds),
    })), [units, bounds]);
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
                    }), _jsx("g", { fillRule: "evenodd", children: mapPaths.map((item) => (_jsx("path", { d: item.path, className: item.unitId === highlightUnitId ? 'country-shape highlight' : 'country-shape' }, item.unitId))) }), selectedXY ? (_jsxs("g", { className: "marker guess-marker", transform: `translate(${selectedXY.x}, ${selectedXY.y})`, children: [_jsx("circle", { r: 8 }), _jsx("circle", { r: 2.8 })] })) : null, targetXY ? (_jsxs("g", { className: "marker target-marker", transform: `translate(${targetXY.x}, ${targetXY.y})`, children: [_jsx("circle", { r: 8 }), _jsx("circle", { r: 2.5 })] })) : null] }), _jsx("p", { className: "map-help", children: helpText })] }));
};
