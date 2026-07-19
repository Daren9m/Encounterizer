import { CELL, RULER_GUTTER } from './scene';
import type { MapScene, SceneIcon } from './scene';
import type { MapPalette } from './palettes';
import type { MapToken } from '../types';

// ─── SVG Builder ─────────────────────────────────────────────────
// Pure string assembly: the same output feeds the on-screen renderer,
// the print twin, the PNG export, and the UVTT embedded image, so it
// must stay self-contained (no css vars, no external refs, no fonts
// beyond the generic stacks).

export interface RenderOptions {
  showRulers?: boolean;
  showRoomLabels?: boolean;
  showGrid?: boolean;
}

const FONT = 'ui-sans-serif, system-ui, sans-serif';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Trim trailing zeros so output stays byte-stable and compact. */
const n = (v: number) => String(Math.round(v * 100) / 100);

function iconMarkup(icon: SceneIcon, color: string): string {
  const px = icon.x * CELL;
  const py = icon.y * CELL;
  const c = CELL;
  const mid = c / 2;
  switch (icon.kind) {
    case 'door':
      return icon.vertical
        ? `<rect x="${n(px + c * 0.36)}" y="${n(py + c * 0.1)}" width="${n(c * 0.28)}" height="${n(c * 0.8)}" fill="${color}"/>`
        : `<rect x="${n(px + c * 0.1)}" y="${n(py + c * 0.36)}" width="${n(c * 0.8)}" height="${n(c * 0.28)}" fill="${color}"/>`;
    case 'trap':
      return `<path d="M${n(px + mid)} ${n(py + c * 0.16)}L${n(px + c * 0.82)} ${n(py + c * 0.78)}L${n(px + c * 0.18)} ${n(py + c * 0.78)}Z" fill="none" stroke="${color}" stroke-width="1.5"/>`
        + `<line x1="${n(px + mid)}" y1="${n(py + c * 0.38)}" x2="${n(px + mid)}" y2="${n(py + c * 0.58)}" stroke="${color}" stroke-width="1.8"/>`
        + `<circle cx="${n(px + mid)}" cy="${n(py + c * 0.68)}" r="1.4" fill="${color}"/>`;
    case 'treasure':
      return `<path d="M${n(px + mid)} ${n(py + c * 0.18)}L${n(px + c * 0.82)} ${n(py + mid)}L${n(px + mid)} ${n(py + c * 0.82)}L${n(px + c * 0.18)} ${n(py + mid)}Z" fill="${color}"/>`;
    case 'entrance':
      return `<path d="M${n(px + c * 0.3)} ${n(py + c * 0.2)}L${n(px + c * 0.8)} ${n(py + mid)}L${n(px + c * 0.3)} ${n(py + c * 0.8)}Z" fill="${color}"/>`;
    case 'exit':
      return `<path d="M${n(px + c * 0.7)} ${n(py + c * 0.2)}L${n(px + c * 0.2)} ${n(py + mid)}L${n(px + c * 0.7)} ${n(py + c * 0.8)}Z" fill="${color}"/>`;
    case 'pillar':
      return `<circle cx="${n(px + mid)}" cy="${n(py + mid)}" r="${n(c * 0.28)}" fill="${color}"/>`;
    case 'altar':
      return `<rect x="${n(px + c * 0.44)}" y="${n(py + c * 0.18)}" width="${n(c * 0.12)}" height="${n(c * 0.64)}" fill="${color}"/>`
        + `<rect x="${n(px + c * 0.26)}" y="${n(py + c * 0.32)}" width="${n(c * 0.48)}" height="${n(c * 0.12)}" fill="${color}"/>`;
    case 'stairs': {
      const rungs = [0.26, 0.42, 0.58, 0.74]
        .map(f => `<line x1="${n(px + c * 0.2)}" y1="${n(py + c * f)}" x2="${n(px + c * 0.8)}" y2="${n(py + c * f)}" stroke="${color}" stroke-width="2"/>`);
      return rungs.join('');
    }
    case 'bridge': {
      const planks = [0.3, 0.5, 0.7]
        .map(f => `<line x1="${n(px)}" y1="${n(py + c * f)}" x2="${n(px + c)}" y2="${n(py + c * f)}" stroke="${color}" stroke-width="2.4"/>`);
      return planks.join('');
    }
    default:
      return '';
  }
}

function tokenMarkup(token: MapToken, palette: MapPalette): string {
  const cx = (token.x + token.sizeCells / 2) * CELL;
  const cy = (token.y + token.sizeCells / 2) * CELL;
  const r = (token.sizeCells * CELL) / 2 - 3;
  const fill = token.kind === 'party' ? palette.tokenPartyFill : palette.tokenMonsterFill;
  const ring = token.kind === 'party' ? palette.tokenPartyRing : palette.tokenMonsterRing;
  const fontSize = token.sizeCells === 1 ? 12 : 15;
  return `<g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${ring}" stroke-width="2.5"/>`
    + `<text x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="${fontSize}" font-weight="700" fill="${palette.tokenText}">${esc(token.label)}</text>`
    + `<title>${esc(token.name)}</title></g>`;
}

/**
 * Render a scene to a complete standalone `<svg>` document string.
 * Layer order: background → floor → tints → grid → icons → walls →
 * room chips → tokens → rulers.
 */
export function sceneToSvgString(
  scene: MapScene,
  palette: MapPalette,
  options: RenderOptions = {},
): string {
  const { showRulers = true, showRoomLabels = true, showGrid = true } = options;
  const gutter = showRulers ? RULER_GUTTER : 0;
  const widthPx = scene.width * CELL + gutter;
  const heightPx = scene.height * CELL + gutter;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">`,
  );
  parts.push(`<rect width="${widthPx}" height="${heightPx}" fill="${palette.background}"/>`);

  // Everything after this renders in grid space.
  parts.push(`<g transform="translate(${gutter} ${gutter})">`);
  parts.push(`<rect width="${scene.width * CELL}" height="${scene.height * CELL}" fill="${palette.floor}"/>`);

  for (const { terrain, cells } of scene.floorTints) {
    const color = palette.tint[terrain];
    if (!color) continue;
    const rects = cells
      .map(cell => {
        const x = (cell % scene.width) * CELL;
        const y = Math.floor(cell / scene.width) * CELL;
        return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}"/>`;
      })
      .join('');
    parts.push(`<g fill="${color}">${rects}</g>`);
  }

  if (showGrid) {
    const lines: string[] = [];
    for (let x = 0; x <= scene.width; x++) {
      lines.push(`M${x * CELL} 0V${scene.height * CELL}`);
    }
    for (let y = 0; y <= scene.height; y++) {
      lines.push(`M0 ${y * CELL}H${scene.width * CELL}`);
    }
    parts.push(
      `<path d="${lines.join('')}" stroke="${palette.grid}" stroke-width="1" fill="none" shape-rendering="crispEdges"/>`,
    );
  }

  for (const icon of scene.icons) {
    parts.push(iconMarkup(icon, palette.icon[icon.kind] ?? palette.wallStroke));
  }

  if (scene.wallRects.length > 0) {
    const rects = scene.wallRects
      .map(r => `<rect x="${r.x * CELL}" y="${r.y * CELL}" width="${r.w * CELL}" height="${r.h * CELL}"/>`)
      .join('');
    parts.push(`<g fill="${palette.wallFill}" shape-rendering="crispEdges">${rects}</g>`);
  }
  if (scene.wallOutlines.length > 0) {
    const path = scene.wallOutlines
      .map(line => 'M' + line.map(p => `${p.x * CELL} ${p.y * CELL}`).join('L'))
      .join('');
    parts.push(
      `<path d="${path}" stroke="${palette.wallStroke}" stroke-width="2" fill="none" stroke-linejoin="miter" shape-rendering="crispEdges"/>`,
    );
  }

  if (showRoomLabels) {
    for (const label of scene.roomLabels) {
      const cx = label.x * CELL + CELL / 2;
      const cy = label.y * CELL + CELL / 2;
      parts.push(
        `<g><circle cx="${cx}" cy="${cy}" r="9" fill="${palette.roomChipFill}" fill-opacity="0.92"/>`
        + `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-size="11" font-weight="700" fill="${palette.roomChipText}">${label.id}</text></g>`,
      );
    }
  }

  for (const token of scene.tokens) {
    parts.push(tokenMarkup(token, palette));
  }

  parts.push('</g>');

  if (showRulers) {
    const labels: string[] = [];
    scene.rulers.cols.forEach((label, i) => {
      labels.push(
        `<text x="${gutter + i * CELL + CELL / 2}" y="${gutter - 6}" text-anchor="middle" font-family="${FONT}" font-size="9" fill="${palette.ruler}">${esc(label)}</text>`,
      );
    });
    scene.rulers.rows.forEach((label, i) => {
      labels.push(
        `<text x="${gutter - 4}" y="${gutter + i * CELL + CELL / 2}" text-anchor="end" dominant-baseline="central" font-family="${FONT}" font-size="9" fill="${palette.ruler}">${esc(label)}</text>`,
      );
    });
    parts.push(labels.join(''));
  }

  parts.push('</svg>');
  return parts.join('');
}
