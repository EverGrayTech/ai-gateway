# Frontend Standards

## Technology Stack
- **Framework**: Next.js 15+
- **Package Manager**: pnpm (always use `pnpm` for all operations)
- **Linting/Formatting**: Biome (`pnpm biome check --apply`)

## React Best Practices
- **React Compiler**: Do NOT manually use `useMemo` or `useCallback`
- **Components**: Prefer Server Components by default
- **Client Components**: Use `'use client'` directive sparingly and only when necessary

## Code Conventions
- **Components**: PascalCase (e.g., `UserProfile.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth.ts`)
- **Utilities**: camelCase (e.g., `formatDate.ts`)
