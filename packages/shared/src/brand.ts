/**
 * Teqdeft brand tokens.
 *
 * Derived from the Teqdeft logo mark (azure on near-black) because
 * teqdeft.com was unreachable from the build environment. If the live site
 * uses different values, correct them HERE ONLY — every surface in the API
 * and the web app reads from this file, and Tailwind generates its palette
 * from it at build time.
 */

export const brand = {
  /** Azure of the logo mark. */
  primary: {
    50: '#E6F6FF',
    100: '#CCEDFF',
    200: '#99DBFF',
    300: '#66C9FF',
    400: '#33B7FF',
    500: '#00A8FF',
    600: '#0086CC',
    700: '#006599',
    800: '#004366',
    900: '#002233',
    950: '#00121C',
  },
  /** Blue-tinted neutral ramp; 950 is the logo ground. */
  ink: {
    50: '#F5F7FA',
    100: '#E4E8EF',
    200: '#C8D0DC',
    300: '#9AA6B8',
    400: '#6B7A90',
    500: '#4A5768',
    600: '#354150',
    700: '#232D3B',
    800: '#151D28',
    900: '#0B1220',
    950: '#060A12',
  },
} as const;

/**
 * Project health colours, blueprint §13.1.
 * Grey is a real state ("insufficient data"), not a disabled style.
 */
export const healthPalette = {
  GREEN: { fg: '#047857', bg: '#D1FAE5', dot: '#10B981' },
  AMBER: { fg: '#B45309', bg: '#FEF3C7', dot: '#F59E0B' },
  RED: { fg: '#B91C1C', bg: '#FEE2E2', dot: '#EF4444' },
  GREY: { fg: '#4A5768', bg: '#E4E8EF', dot: '#9AA6B8' },
} as const;

export const semantic = {
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#00A8FF',
} as const;

export const brandMeta = {
  productName: 'Delivery OS',
  companyName: 'Teqdeft',
  wordmark: 'teqdeft',
  tagline: 'What did we promise? What remains? Will we deliver on time?',
} as const;
