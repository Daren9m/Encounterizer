// ─── Browser-side export helpers ─────────────────────────────────
// Blob downloads and SVG→PNG rasterization. Browser-only (canvas,
// Image, object URLs) — keep out of src/lib per the engine/browser
// split.

/** Maximum raster width; beyond this canvases get flaky or huge. */
const MAX_PNG_WIDTH = 4096;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function svgToCanvas(svgString: string, pxWidth: number): Promise<HTMLCanvasElement> {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not load the map image for export.'));
      img.src = url;
    });
    // The svg string carries width/height attributes, so natural size
    // is trustworthy; scale to the requested export width.
    const width = Math.round(Math.min(pxWidth, MAX_PNG_WIDTH));
    const scale = width / img.width;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Render a self-contained svg string to a PNG blob. */
export async function rasterizeSvg(svgString: string, pxWidth: number): Promise<Blob> {
  const canvas = await svgToCanvas(svgString, pxWidth);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))),
      'image/png',
    );
  });
}

/** Base64 PNG (no data: prefix) — the shape the UVTT export embeds. */
export async function svgToPngBase64(svgString: string, pxWidth: number): Promise<string> {
  const canvas = await svgToCanvas(svgString, pxWidth);
  return canvas.toDataURL('image/png').split(',')[1];
}
