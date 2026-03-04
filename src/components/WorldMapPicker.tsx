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
  showUnitLabels?: boolean;
  unitLabelAccessor?: (unit: GeoUnitRecord) => string | undefined;
};

type LabelRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type MapLabelPlacement = {
  unitId: string;
  label: string;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  drawLeader: boolean;
};

const MAP_WIDTH = 720;
const MAP_HEIGHT = 460;
const MOVE_STEP = 0.35;
const LABEL_FONT_SIZE = 10;
const LABEL_HEIGHT = 16;
const LABEL_MARGIN = 6;
const CJK_CHAR_REGEX = /[\u3400-\u9FFF\uF900-\uFAFF]/;

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

const estimateLabelWidth = (label: string): number => {
  const width = Array.from(label).reduce((sum, char) => {
    if (CJK_CHAR_REGEX.test(char)) {
      return sum + LABEL_FONT_SIZE * 0.95;
    }

    return sum + LABEL_FONT_SIZE * 0.62;
  }, 0);

  return Math.max(28, width + 12);
};

const labelRect = (x: number, y: number, width: number, height: number): LabelRect => ({
  left: x - width / 2,
  right: x + width / 2,
  top: y - height / 2,
  bottom: y + height / 2,
});

const clampLabelCenter = (x: number, y: number, width: number, height: number): { x: number; y: number } => ({
  x: clamp(x, LABEL_MARGIN + width / 2, MAP_WIDTH - LABEL_MARGIN - width / 2),
  y: clamp(y, LABEL_MARGIN + height / 2, MAP_HEIGHT - LABEL_MARGIN - height / 2),
});

const overlapArea = (left: LabelRect, right: LabelRect): number => {
  const overlapWidth = Math.min(left.right, right.right) - Math.max(left.left, right.left);
  const overlapHeight = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top);

  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

  return overlapWidth * overlapHeight;
};

const labelOffsetMultipliers: Array<{ dx: number; dy: number }> = (() => {
  const values: Array<{ dx: number; dy: number }> = [{ dx: 0, dy: 0 }];
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

const resolveLabelPlacements = (
  units: GeoUnitRecord[],
  bounds: MapBounds,
  unitLabelAccessor: (unit: GeoUnitRecord) => string | undefined,
): MapLabelPlacement[] => {
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
    .filter(
      (
        item,
      ): item is {
        unitId: string;
        label: string;
        anchorX: number;
        anchorY: number;
        width: number;
        height: number;
      } => Boolean(item),
    )
    .sort((left, right) => right.label.length - left.label.length || left.anchorY - right.anchorY);

  const occupiedRects: LabelRect[] = [];
  const byId = new Map<string, MapLabelPlacement>();

  requested.forEach((item) => {
    const stepX = Math.max(14, item.width * 0.55);
    const stepY = Math.max(12, item.height * 1.2);

    let best: { x: number; y: number; score: number; overlap: number } | null = null;

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
  return [...byId.values()].sort(
    (left, right) => (unitOrder.get(left.unitId) ?? 0) - (unitOrder.get(right.unitId) ?? 0),
  );
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
  showUnitLabels = false,
  unitLabelAccessor = (unit) => unit.nameLocal ?? unit.name,
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
  const mapLabels = useMemo(
    () =>
      showUnitLabels
        ? resolveLabelPlacements(units, bounds, unitLabelAccessor)
        : [],
    [units, bounds, showUnitLabels, unitLabelAccessor],
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

        {mapLabels.length > 0 ? (
          <g className="map-label-layer" aria-hidden="true">
            {mapLabels.map((item) =>
              item.drawLeader ? (
                <line
                  key={`leader-${item.unitId}`}
                  x1={item.anchorX}
                  y1={item.anchorY}
                  x2={item.x}
                  y2={item.y}
                  className="map-unit-label-line"
                />
              ) : null,
            )}
            {mapLabels.map((item) => (
              <text
                key={`label-${item.unitId}`}
                x={item.x}
                y={item.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="map-unit-label"
              >
                {item.label}
              </text>
            ))}
          </g>
        ) : null}

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
