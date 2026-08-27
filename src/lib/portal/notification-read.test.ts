import { afterEach, describe, expect, it } from "vitest";
import {
  getUnreadPortalNotifications,
  markPortalNotificationsRead,
  resetPortalNotificationReadsForTests,
} from "./notification-read";

const notifications = [
  { id: "release", title: "门户已更新" },
  { id: "maintenance", title: "维护通知" },
];

describe("portal notification reads", () => {
  afterEach(() => {
    resetPortalNotificationReadsForTests();
  });

  it("clears the unread badge after the notification menu is viewed", () => {
    expect(getUnreadPortalNotifications(notifications)).toHaveLength(2);

    markPortalNotificationsRead(notifications);

    expect(getUnreadPortalNotifications(notifications)).toHaveLength(0);
  });

  it("keeps notifications that arrive later unread", () => {
    markPortalNotificationsRead(notifications);
    const next = [...notifications, { id: "new-feature", title: "新功能" }];

    expect(getUnreadPortalNotifications(next).map((notice) => notice.id)).toEqual(["new-feature"]);
  });
});
