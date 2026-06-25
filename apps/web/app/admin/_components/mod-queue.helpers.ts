// Pure helpers for <ModQueue>, kept out of the component so it reads as render
// logic. Currently just the filter haystack: the lowercased blob of a row's
// searchable text that the filter box matches against.

import type { ModQueueItem } from "../queues/queue-config";

export const haystack = (item: ModQueueItem): string =>
  [item.primary, item.secondary, ...(item.fields?.map((f) => f.value) ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
