# Dharma Frontend (Vite + React + TS)

This app uses Vite with React and TypeScript. Tailwind CSS and shadcn-style primitives are configured, with path aliases via `vite-tsconfig-paths`.

## Import Conventions

Path aliases are enabled via `vite-tsconfig-paths` and `tsconfig.app.json` (`@/*` → `src/*`). Prefer absolute imports using the alias to avoid brittle relative paths and duplicate modules.

- Use `@/…` for all imports from `src`
- Prefer lowercase component filenames and imports (e.g., `@/components/ui/button`)
- For compatibility, both `@/components/ui/button` and `@/components/ui/Button` currently exist, but new code should import from the lowercase path

Examples:

```ts
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { designTokens } from '@/lib/design-tokens'
```

Rationale: This keeps imports consistent across the app and prevents divergence like `Button` vs `button` components. The alias is active in `vite.config.ts` and set in `tsconfig.app.json`.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
