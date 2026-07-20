import rss from '@astrojs/rss';
import { getPublishedNotes } from '../lib/content';
import { SITE } from '../site.config';

export async function GET(context: { site: URL }) {
  const notes = await getPublishedNotes();

  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site,
    items: notes.map((note) => ({
      title: note.data.title,
      pubDate: note.data.published,
      link: `/notes/${note.id}/`,
    })),
  });
}
