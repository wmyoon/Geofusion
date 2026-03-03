import { jsx as _jsx } from "react/jsx-runtime";
import { geometryToFittedPath } from '../lib/geo';
const VIEWBOX_WIDTH = 280;
const VIEWBOX_HEIGHT = 220;
export const OutlinePreview = ({ geometry }) => {
    const path = geometryToFittedPath(geometry, VIEWBOX_WIDTH, VIEWBOX_HEIGHT, 18);
    return (_jsx("figure", { className: "outline-preview", "aria-label": "Geographic outline", children: _jsx("svg", { viewBox: `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`, role: "img", "aria-hidden": "true", children: _jsx("path", { d: path, fill: "currentColor", stroke: "currentColor", strokeWidth: 1.2, vectorEffect: "non-scaling-stroke" }) }) }));
};
