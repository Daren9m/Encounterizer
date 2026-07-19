import { defineConfig, globalIgnores } from 'eslint/config';
import coreWebVitals from 'eslint-config-next/core-web-vitals';

// Flat config (ESLint 9+). eslint-config-next/core-web-vitals bundles the
// base, TypeScript, and Core Web Vitals rule sets for Next.js 16.
export default defineConfig([
  ...coreWebVitals,
  {
    // react-hooks v7 promotes these React Compiler-era heuristics to errors.
    // The flagged sites (share-link hydration effects, the latest-ref pattern
    // in use-persistent-state) predate the rules and are behavior-frozen by
    // the ?seed= contract — evaluate them separately rather than mid-upgrade.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'next-env.d.ts']),
]);
