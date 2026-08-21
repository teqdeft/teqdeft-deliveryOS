import type { Config } from 'tailwindcss';
import { brand } from '@deliveryos/shared';

/**
 * The palette is generated from packages/shared/src/brand.ts rather than
 * duplicated here, so correcting a brand hex is a one-file change that reaches
 * every surface at once.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: brand.primary,
        ink: brand.ink,
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 18, 32, 0.04), 0 1px 3px rgba(11, 18, 32, 0.06)',
        lift: '0 4px 12px rgba(11, 18, 32, 0.08), 0 1px 3px rgba(11, 18, 32, 0.06)',
        panel: '0 12px 32px rgba(11, 18, 32, 0.14)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
