/**
 * Links for the "I'd rather watch it than play it" flow.
 *
 * Deliberately plain search URLs instead of the YouTube Data API: that needs a key
 * and has tight quotas, while an embedded player would drag third-party cookies onto
 * the page. One tap into the right search results is all this scenario needs.
 */

export interface WatchLink {
  label: string
  url: string
  host: 'youtube' | 'twitch'
}

function youtube(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

export function watchLinks(title: string): WatchLink[] {
  return [
    { label: 'Longplay', url: youtube(`${title} longplay no commentary`), host: 'youtube' },
    { label: 'Game movie', url: youtube(`${title} game movie all cutscenes`), host: 'youtube' },
    { label: 'Walkthrough', url: youtube(`${title} walkthrough`), host: 'youtube' },
    { label: 'Review', url: youtube(`${title} review`), host: 'youtube' },
    { label: 'Twitch', url: `https://www.twitch.tv/search?term=${encodeURIComponent(title)}`, host: 'twitch' },
  ]
}
