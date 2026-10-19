
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getNotifications,
  markNotificationAsRead,
} from "./api";
import "./Notifications.css";

function getType(message = "") {
  const text = message.toLowerCase();

  if (text.includes("leave") && text.includes("approved")) {
    return "Leave Approved";
  }

  if (text.includes("leave") && text.includes("rejected")) {
    return "Leave Rejected";
  }

  if (/\blate\b/.test(text)) return "Late";
  if (/\babsent\b/.test(text)) return "Absent";
  if (/\bpresent\b/.test(text)) return "Present";
  if (text.includes("welcome")) return "General";

  return "General";
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString();
}

function getEmployeeName(item) {
  const firstName = item.first_name || "";
  const lastName = item.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || "Employee name unavailable";
}

export default function Notifications({ page = false, onOpenPage }) {
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      setError("");

      const rows = await getNotifications();

      setNotifications(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();

    const interval = window.setInterval(loadNotifications, 15000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  const unreadCount = notifications.filter(
    (item) => !item.is_read
  ).length;

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const type = getType(item.message);

      if (filter === "Unread") return !item.is_read;
      if (filter === "All") return true;

      return type === filter;
    });
  }, [notifications, filter]);

  async function handleMarkRead(item) {
    if (item.is_read) return;

    try {
      const updated = await markNotificationAsRead(
        item.notification_id
      );

      const saved = updated.notification;

      setNotifications((previous) =>
        previous.map((notification) =>
          notification.notification_id === item.notification_id
            ? {
                ...notification,
                ...saved,
                is_read: true,
              }
            : notification
        )
      );
    } catch (err) {
      setError(
        err.message || "Unable to mark notification as read."
      );
    }
  }

  async function handleMarkAllRead() {
    const unread = notifications.filter(
      (item) => !item.is_read
    );

    for (const item of unread) {
      try {
        await markNotificationAsRead(item.notification_id);
      } catch (err) {
        setError(
          err.message || "Some notifications could not be updated."
        );
        break;
      }
    }

    await loadNotifications();
  }

  const filters = [
    "All",
    "Unread",
    "Leave Approved",
    "Leave Rejected",
    "Present",
    "Absent",
    "Late",
  ];

  const list = (
    <>
      <div className="notification-toolbar">
        <div>
          <strong>
            {page ? "Your notifications" : "Notifications"}
          </strong>
          <p>{unreadCount} unread</p>
        </div>

        <button
          type="button"
          className="notification-text-button"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
        >
          Mark all read
        </button>
      </div>

      {page && (
        <div className="notification-filters">
          {filters.map((item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? "selected" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="notification-empty">
          Loading notifications...
        </p>
      )}

      {error && (
        <p className="notification-error" role="alert">
          {error}
          <button
            type="button"
            className="notification-text-button"
            onClick={loadNotifications}
          >
            Retry
          </button>
        </p>
      )}

      {!loading &&
        !error &&
        filteredNotifications.length === 0 && (
          <p className="notification-empty">
            No notifications to display.
          </p>
        )}

      <div className="notification-list">
        {filteredNotifications.map((item) => (
          <article
            key={item.notification_id}
            className={`notification-item ${
              item.is_read ? "read" : "unread"
            }`}
          >
            <div className="notification-dot" />

            <div className="notification-content">
              <div className="notification-item-heading">
                <span className="notification-type">
                  {getType(item.message)}
                </span>

                <time>{formatDate(item.created_at)}</time>
              </div>

              <div className="notification-employee">
                <span className="notification-employee-id">
                  Employee ID: {item.employee_id ?? "N/A"}
                </span>

                <span className="notification-employee-name">
                  {getEmployeeName(item)}
                </span>
              </div>

              <p className="notification-message">
                {item.message}
              </p>

              {!item.is_read && (
                <button
                  type="button"
                  className="notification-text-button"
                  onClick={() => handleMarkRead(item)}
                >
                  Mark as read
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );

  if (page) {
    return (
      <section className="notifications-page">
        {list}
      </section>
    );
  }

  return (
    <div className="notification-bell-wrap">
      <button
        type="button"
        className="notification-bell"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>

        {unreadCount > 0 && (
          <span className="notification-count">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-popover">
          {list}

          {onOpenPage && (
            <button
              type="button"
              className="notification-view-all"
              onClick={() => {
                setOpen(false);
                onOpenPage();
              }}
            >
              View all notifications
            </button>
          )}
        </div>
      )}
    </div>
  );
}
