# Project Rules

## Local Skill References

Before making code changes, check `.agents/skills` and apply the files that match the task.

- For UI, shared components, or layout work, use `.agents/skills/components.md`.
- For Next.js App Router pages, layouts, loading states, route handlers, or metadata, use `.agents/skills/app_router.md` and `.agents/skills/seo_metadata.md` when page metadata is affected.
- For implementation quality, naming, imports, and maintainability, use `.agents/skills/code_quality.md`.
- For forms, auth, data fetching, database, security, performance, middleware/proxy, deployment, i18n, or realtime work, use the matching `.agents/skills/*.md` file before editing those areas.
- Do not blindly apply unrelated skill files. If two skill files conflict, prefer the one closest to the task and the existing source code.

## Brand And UI System

Use the G4 Builders Inc visual system established in `src/components/ui/fin-tech-landing-page.tsx`.

- Brand name: `G4 Builders Inc`.
- Product context: construction cost estimation, BOQ, progress billing, project cost tracking, approvals, invoices, reports, and margin control.
- Tone: professional, construction/project-management focused, direct, and operational.
- Avoid fintech wording such as banking, currencies, accounts, fraud, or moneyflow unless the feature truly needs financial language.

## Colors

Use this palette as the default for new UI:

- Page and section backgrounds: white, `#ffffff`.
- Primary text: Tailwind `stone-950`.
- Secondary text: Tailwind `stone-600`.
- Muted text and borders: Tailwind `stone-400`, `stone-500`, `stone-200`.
- Primary action: Tailwind `red-700`, hover `red-800`, focus `red-600`.
- Dark panels: balanced red gradients from `red-950` to `red-800`.
- Accent panels: light red/rose gradients from `rose-600` to `rose-400`.
- Progress/accent fills: `rose-200`, `rose-50`, and `rose-400`.
- Surfaces: white panels with `ring-stone-200` and restrained shadows.

Do not introduce a new dominant palette without a clear reason. Keep the look grounded in white backgrounds, stone neutrals, balanced light red accents, deeper red actions, and soft rose highlights.

## Typography

- Use the system sans font stack configured in `src/app/globals.css`: `Arial, Helvetica, sans-serif`.
- Do not add network-dependent font loading for the default app shell.
- Use `font-semibold` and `tracking-tight` for major headings.
- Keep body text readable with normal tracking, `text-sm` to `text-base` in dense UI, and `text-stone-600` for supporting copy.

## Component Structure

- Keep shared UI under `src/components/ui`.
- Keep route-level code in `src/app`; colocate route-private components in `_components` folders when routes grow.
- Prefer lucide-react icons for actions and domain signals.
- Keep cards compact with `rounded-xl` or less unless matching existing UI requires otherwise.
- Use TypeScript props for reusable components. Avoid untyped component props.
- Use `"use client"` only when interactivity, hooks, browser APIs, or animation libraries require it.

## Verification

After meaningful UI or route changes, run:

```bash
npm run lint
npm run build
```

If a build is blocked by environment or generated-cache issues, document the exact blocker and avoid unrelated dependency or framework changes.
