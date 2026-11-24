import type { Viewpoint } from '../types/port';

const KEY = 'langang-viewmarks';

export function loadBookmarks(): Viewpoint[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]') as Viewpoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function storeBookmarks(list: Viewpoint[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}
