/**
 * Colour helpers for white-label theming.
 *
 * Deliberately dependency-free and importable from both server and client code:
 * the admin form previews a colour before saving, the branding service resolves
 * it for the panel, and both must agree on what a given hex resolves to.
 */

/** Platform default — the Pramaan purple that ships in globals.css. */
export const DEFAULT_PRIMARY_COLOR = '#8B3D88';
/** Its hover shade, kept as a constant so the default renders byte-identical. */
export const DEFAULT_PRIMARY_COLOR_HOVER = '#7A3376';

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Normalises user input to `#rrggbb`, or returns null if it is not a hex
 * colour. Only hex is accepted: the value is interpolated into a CSS custom
 * property, so anything free-form would be a stylesheet injection.
 */
export function normalizeHexColor(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const value = input.trim();
    if (!HEX_RE.test(value)) return null;
    const hex = value.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return `#${full.toLowerCase()}`;
}

function toRgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
    return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

/** Mixes `amount` (0–1) of black into a colour — used for the hover shade. */
export function darken(hex: string, amount = 0.12): string {
    const [r, g, b] = toRgb(hex);
    return toHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)]);
}

/**
 * Hover shade for a primary colour. The default keeps its hand-picked value so
 * unbranded deployments render exactly as before.
 */
export function hoverColorFor(primary: string): string {
    return primary.toLowerCase() === DEFAULT_PRIMARY_COLOR.toLowerCase()
        ? DEFAULT_PRIMARY_COLOR_HOVER
        : darken(primary);
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = toRgb(hex).map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio against white — brand colours carry white button labels. */
export function contrastWithWhite(hex: string): number {
    return 1.05 / (relativeLuminance(hex) + 0.05);
}
