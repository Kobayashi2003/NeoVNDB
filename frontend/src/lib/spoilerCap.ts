/** A tag or trait as a filter value capped at the reader's spoiler level, for
 *  a list of what carries it: a tag or trait can itself be a spoiler for an
 *  entry. Server-only, read from the preferences cookie the layout reads. */
import { cookies } from 'next/headers';
import { PREFS_COOKIE, readPrefs } from './prefs';

/** `id`, or `id:<score>:<level>` below the most spoilery level; a tag's
 *  filter takes a lowest score first, so `score` is one every tag clears (its
 *  ratings are averages of positive votes). */
export async function uptoSpoiler(id: string, score?: string): Promise<string> {
  const { spoiler } = readPrefs((await cookies()).get(PREFS_COOKIE)?.value);
  if (spoiler >= 2) return id;
  return score === undefined ? `${id}:${spoiler}` : `${id}:${score}:${spoiler}`;
}
