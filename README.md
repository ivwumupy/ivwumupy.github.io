# Gradient Notes

A minimal, static Astro blog for writing about mathematics, language-model
architecture, reinforcement learning, and adjacent ideas.

- Static HTML with no client-side JavaScript
- Markdown content collections
- KaTeX math typesetting
- Syntax highlighting
- Topic archives and RSS
- One small responsive stylesheet using system fonts

## Run locally

~~~sh
pnpm install
pnpm dev
~~~

Create a production build with:

~~~sh
pnpm build
~~~

## Add a note

Add a Markdown file to `src/content/notes/` with this frontmatter:

~~~yaml
---
title: "A useful title"
description: "One sentence describing the note."
published: 2026-07-18
topics:
  - math
featured: false
draft: false
---
~~~

Inline math uses `$...$`; display math uses `$$...$$`.

## Customize

- Change the title, author, description, and topic labels in `src/site.config.ts`.
- Replace `https://example.com` in `astro.config.mjs` with the production URL.
- Edit the sample notes in `src/content/notes/` or replace them with your own.
