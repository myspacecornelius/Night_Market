# Job Search Automation Hub

This folder contains a standalone Vite + React + Tailwind project that packages the Job Search Automation Hub experience originally prototyped inside Night Market. You can copy this directory into a fresh repository and push it to GitHub as its own project.

## Getting Started

```bash
npm install
npm run dev
```

The development server starts on [http://localhost:5173](http://localhost:5173).

## Available Scripts

- `npm run dev` – start the Vite development server
- `npm run build` – type check and build the production bundle
- `npm run preview` – preview the production build locally

## Tech Stack

- React 18 with TypeScript
- Vite build tooling
- Tailwind CSS for styling
- Framer Motion for subtle animations
- Lucide icons and date-fns utilities

## Notes

- The UI data is seeded with sample job leads, tasks, and automation templates so the experience feels complete out of the box.
- Tailwind CSS classes are embedded directly in the component; customize `tailwind.config.cjs` or the utility classes to match your design system.
- Feel free to adapt the project structure or integrate with your backend pipelines once it lives in its own repository.
