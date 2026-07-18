import { getCollection, type CollectionEntry } from 'astro:content';

export type Note = CollectionEntry<'notes'>;

export async function getPublishedNotes() {
  const notes = await getCollection('notes', ({ data }) => import.meta.env.DEV || !data.draft);

  return notes.sort(
    (a, b) => b.data.published.getTime() - a.data.published.getTime(),
  );
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

