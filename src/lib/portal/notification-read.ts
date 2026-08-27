/**
 * Per-browser read state for public portal notifications. Notifications are
 * global content, while whether they have been seen belongs to the visitor.
 */
const STORAGE_KEY = "reizo:portal-read-notifications";

type NotificationLike = { id: string };

let hydrated = false;
const readNotificationIds = new Set<string>();

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;

  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return;
    for (const id of stored) {
      if (typeof id === "string" && id) readNotificationIds.add(id);
    }
  } catch {
    // An unavailable or malformed localStorage value must not block the menu.
  }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...readNotificationIds]));
  } catch {
    // Private browsing and storage quotas can reject writes; keep this-tab state.
  }
}

export function getUnreadPortalNotifications<T extends NotificationLike>(notifications: readonly T[]): T[] {
  hydrate();
  return notifications.filter((notification) => !readNotificationIds.has(notification.id));
}

export function markPortalNotificationsRead(notifications: Iterable<NotificationLike>) {
  hydrate();
  let changed = false;
  for (const notification of notifications) {
    if (notification.id && !readNotificationIds.has(notification.id)) {
      readNotificationIds.add(notification.id);
      changed = true;
    }
  }
  if (changed) persist();
}

export function resetPortalNotificationReadsForTests() {
  hydrated = true;
  readNotificationIds.clear();
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
}
