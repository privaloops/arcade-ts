/**
 * Tool cursors — 16x16 PNG-style cursors generated from canvas.
 * Each cursor is a small icon drawn programmatically and converted to a data URL.
 */

function createCursor(draw: (ctx: CanvasRenderingContext2D) => void, hotX: number, hotY: number): string {
  const cvs = document.createElement('canvas');
  cvs.width = 16;
  cvs.height = 16;
  const ctx = cvs.getContext('2d')!;
  draw(ctx);
  return `url("${cvs.toDataURL()}") ${hotX} ${hotY}, crosshair`;
}

/** Pencil: small angled pen shape, hotspot at tip (bottom-left) */
export const pencilCursor = createCursor((ctx) => {
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1;
  // Pen body
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(15, 3);
  ctx.lineTo(5, 13);
  ctx.lineTo(2, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Tip
  ctx.beginPath();
  ctx.moveTo(5, 13);
  ctx.lineTo(2, 10);
  ctx.lineTo(1, 14);
  ctx.closePath();
  ctx.fillStyle = '#666';
  ctx.fill();
  ctx.stroke();
}, 1, 15);

/** Fill bucket: bucket shape, hotspot at pour point */
export const fillCursor = createCursor((ctx) => {
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1;
  // Bucket body
  ctx.beginPath();
  ctx.moveTo(4, 3);
  ctx.lineTo(11, 3);
  ctx.lineTo(13, 8);
  ctx.lineTo(10, 14);
  ctx.lineTo(2, 14);
  ctx.lineTo(1, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Handle
  ctx.beginPath();
  ctx.moveTo(6, 3);
  ctx.lineTo(6, 1);
  ctx.lineTo(9, 1);
  ctx.lineTo(9, 3);
  ctx.stroke();
  // Pour drop
  ctx.fillStyle = '#48f';
  ctx.beginPath();
  ctx.arc(14, 12, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.stroke();
}, 13, 14);

/** Eyedropper: pipette shape, hotspot at tip */
export const eyedropperCursor = createCursor((ctx) => {
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 1;
  // Pipette body (angled)
  ctx.beginPath();
  ctx.moveTo(11, 1);
  ctx.lineTo(14, 4);
  ctx.lineTo(6, 12);
  ctx.lineTo(3, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Tip
  ctx.beginPath();
  ctx.moveTo(6, 12);
  ctx.lineTo(3, 9);
  ctx.lineTo(1, 14);
  ctx.closePath();
  ctx.fillStyle = '#999';
  ctx.fill();
  ctx.stroke();
  // Bulb
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(12.5, 2.5, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}, 1, 15);

/** Eraser: rectangular eraser, hotspot at bottom edge */
export const eraserCursor = createCursor((ctx) => {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  // Eraser body (angled rectangle)
  ctx.fillStyle = '#f8c8d0';
  ctx.beginPath();
  ctx.moveTo(3, 5);
  ctx.lineTo(10, 1);
  ctx.lineTo(14, 8);
  ctx.lineTo(7, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Bottom band
  ctx.fillStyle = '#e88';
  ctx.beginPath();
  ctx.moveTo(5, 8.5);
  ctx.lineTo(12, 4.5);
  ctx.lineTo(14, 8);
  ctx.lineTo(7, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}, 5, 13);

/** Magic wand: star-tipped wand, hotspot at tip */
export const wandCursor = createCursor((ctx) => {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  // Wand stick (angled)
  ctx.fillStyle = '#c8a060';
  ctx.beginPath();
  ctx.moveTo(3, 14);
  ctx.lineTo(5, 12);
  ctx.lineTo(11, 5);
  ctx.lineTo(9, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Star sparkle at tip
  ctx.fillStyle = '#ffe040';
  ctx.strokeStyle = '#c90';
  ctx.beginPath();
  ctx.moveTo(12, 0); ctx.lineTo(13, 3); ctx.lineTo(16, 2);
  ctx.lineTo(14, 4); ctx.lineTo(15, 7); ctx.lineTo(12, 5);
  ctx.lineTo(10, 7); ctx.lineTo(10, 4); ctx.lineTo(8, 2);
  ctx.lineTo(11, 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}, 1, 15);
