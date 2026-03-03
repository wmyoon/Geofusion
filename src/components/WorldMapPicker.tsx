import { KeyboardEvent, MouseEvent, useMemo, useRef } from 'react';
import { GeoUnitRecord, Point, RegionGeometry } from '../types';
import { geometriesBounds } from '../lib/geo';

type MapBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

type WorldMapPickerProps = {
  units: GeoUnitRecord[];
  selectedPoint: Point | null;
  onSelect: (point: Point) => void;
  targetPoint?: Point;
  revealTarget?: boolean;
  highlightUnitId?: string;
  ariaLabel?: string;
  interactive?: boolean;
  helpText?: string;
};

const MAP_WIDTH = 720;
const MAP_HEIGHT = 460;
const MOVE_STEP = 0.35;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const withPadding = (bounds: MapBounds): MapBounds => ({
  minLng: bounds.minLng - 1.5,
  maxLng: bounds.maxLng + 1.5,
  minLat: bounds.minLat - 1.5,
  maxLat: bounds.maxLat + 1.5,
});

const project = (point: Point, bounds: MapBounds): { x: number; y: number } => {
  const width = Math.max(1e-8, bounds.maxLng - bounds.minLng);
  const height = Math.max(1e-8, bounds.maxLat - bounds.minLat);

  return {
    x: ((point.lng - bounds.minLng) / width) * MAP_WIDTH,
    y: ((bounds.maxLat - point.lat) / height) * MAP_HEIGHT,
  };
};

const inverseProject = (x: number, y: number, bounds: MapBounds): Point => {
  const width = Math.max(1e-8, bounds.maxLng - bounds.minLng);
  const height = Math.max(1e-8, bounds.maxLat - bounds.minLat);

  return {
    lng: bounds.minLng + (x / MAP_WIDTH) * width,
    lat: bounds.maxLat - (y / MAP_HEIGHT) * height,
  };
};

const geometryToPath = (geometry: RegionGeometry, bounds: MapBounds): string => {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][]);

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

export const WorldMapPicker = ({
  units,
  selectedPoint,
  onSelect,
  targetPoint,
  revealTarget = false,
  highlightUnitId,
  ariaLabel = 'Map picker. Click to place a pin. Arrow keys move the pin.',
  interactive = true,
  helpText = 'Tap map or use arrow keys to place your guess.',
}: WorldMapPickerProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const bounds = useMemo(() => {
    const raw = geometriesBounds(units.map((item) => item.geometry));
    return withPadding(raw);
  }, [units]);

  const mapPaths = useMemo(
    () =>
      units.map((unit) => ({
        unitId: unit.id,
        path: geometryToPath(unit.geometry, bounds),
      })),
    [units, bounds],
  );

  const selectedXY = selectedPoint ? project(selectedPoint, bounds) : null;
  const targetXY = revealTarget && targetPoint ? project(targetPoint, bounds) : null;

  const onMapClick = (event: MouseEvent<SVGSVGElement>): void => {
    if (!svgRef.current) {
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * MAP_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * MAP_HEIGHT;
    onSelect(inverseProject(x, y, bounds));
  };

  const onMapKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
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

  return (
    <div className="world-map-wrap">
      <svg
        ref={svgRef}
        className="world-map"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role={interactive ? 'application' : 'img'}
        tabIndex={interactive ? 0 : -1}
        aria-label={ariaLabel}
        onClick={interactive ? onMapClick : undefined}
        onKeyDown={interactive ? onMapKeyDown : undefined}
      >
        <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} className="ocean" />

        {Array.from({ length: latLines + 1 }).map((_, index) => {
          const y = (index / latLines) * MAP_HEIGHT;
          return <line key={`lat-${index}`} x1={0} y1={y} x2={MAP_WIDTH} y2={y} className="graticule" />;
        })}

        {Array.from({ length: lonLines + 1 }).map((_, index) => {
          const x = (index / lonLines) * MAP_WIDTH;
          return <line key={`lon-${index}`} x1={x} y1={0} x2={x} y2={MAP_HEIGHT} className="graticule" />;
        })}

        <g fillRule="evenodd">
          {mapPaths.map((item) => (
            <path
              key={item.unitId}
              d={item.path}
              className={item.unitId === highlightUnitId ? 'country-shape highlight' : 'country-shape'}
            />
          ))}
        </g>

        {selectedXY ? (
          <g className="marker guess-marker" transform={`translate(${selectedXY.x}, ${selectedXY.y})`}>
            <circle r={8} />
            <circle r={2.8} />
          </g>
        ) : null}

        {targetXY ? (
          <g className="marker target-marker" transform={`translate(${targetXY.x}, ${targetXY.y})`}>
            <circle r={8} />
            <circle r={2.5} />
          </g>
        ) : null}
      </svg>

      <p className="map-help">{helpText}</p>
    </div>
  );
};
