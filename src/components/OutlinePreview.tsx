import { RegionGeometry } from '../types';
import { geometryToFittedPath } from '../lib/geo';

type OutlinePreviewProps = {
  geometry: RegionGeometry;
};

const VIEWBOX_WIDTH = 280;
const VIEWBOX_HEIGHT = 220;

export const OutlinePreview = ({ geometry }: OutlinePreviewProps) => {
  const path = geometryToFittedPath(geometry, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, 18);

  return (
    <figure className="outline-preview" aria-label="Geographic outline">
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-hidden="true">
        <path d={path} fill="currentColor" stroke="currentColor" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
};
