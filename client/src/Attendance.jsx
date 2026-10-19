
import { useCallback, useEffect, useState } from "react";
import { getAttendance } from "./api";

function todayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
}

function formatTime(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
}

async function createNotification(employeeId, message) {
  const response = await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employee_id: Number(employeeId),
      message,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Could not save notification.");
  }

  return result;
}

function showBrowserNotification(title, message) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    new Notification(title, { body: message });
  } catch (error) {
    console.warn("Browser notification could not be displayed:", error);
  }
}

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notificationWarning, setNotificationWarning] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [employeeId, setEmployeeId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(todayString());
  const [attendanceStatus, setAttendanceStatus] = useState("Present");

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [attendanceData, employeeResponse] = await Promise.all([
        getAttendance(),
        fetch("/api/employees"),
      ]);

      if (!employeeResponse.ok) {
        throw new Error("Unable to load employees.");
      }

      const employeeData = await employeeResponse.json();

      if (!Array.isArray(attendanceData) || !Array.isArray(employeeData)) {
        throw new Error("The API returned an unexpected response.");
      }

      setRecords(attendanceData);
      setEmployees(employeeData);

      setEmployeeId((current) => {
        if (
          current &&
          employeeData.some(
            (employee) => String(employee.employee_id) === String(current)
          )
        ) {
          return current;
        }

        return employeeData.length
          ? String(employeeData[0].employee_id)
          : "";
      });
    } catch (err) {
      setError(err.message || "Unable to load attendance data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Ask permission only after the user chooses to enable browser notifications.
  async function enableBrowserNotifications() {
    setNotificationWarning("");
    
    if (!("Notification" in window)) {
      setNotificationWarning(
        "This browser does not support desktop notifications."
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();

      if (permission === "granted") {
        setSuccess("Browser notifications enabled.");
      } else {
        setNotificationWarning(
          "Browser notifications are blocked. You can still use in-app notifications."
        );
      }
    } catch {
      setNotificationWarning(
        "Unable to enable browser notifications in this browser."
      );
    }
  }

  async function handleSaveAttendance(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setNotificationWarning("");

    if (!employeeId || !attendanceDate || !attendanceStatus) {
      setError("Please select an employee, date, and status.");
      return;
    }

    const employee = employees.find(
      (item) => String(item.employee_id) === String(employeeId)
    );

    if (!employee) {
      setError("Please select a valid employee.");
      return;
    }

    setSaving(true);

    let attendanceSaved = false;

    try {
      // First save the attendance record.
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: Number(employeeId),
          attendance_date: attendanceDate,
          status: attendanceStatus,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Unable to save attendance.");
      }

      attendanceSaved = true;

      const employeeName =
        `${employee.first_name || ""} ${employee.last_name || ""}`.trim();

      const dateLabel = formatDate(attendanceDate);

      const employeeMessage =
        `Attendance marked ${attendanceStatus} for ${dateLabel}.`;

      const adminMessage =
        `Attendance recorded: ${employeeName} (Employee ID ${employeeId}) ` +
        `was marked ${attendanceStatus} on ${dateLabel}.`;

      // Save notifications in the existing notifications table.
      // Employee notification is associated with that employee ID.
      const notificationResults = await Promise.allSettled([
        createNotification(employeeId, employeeMessage),
        // The second notification uses the same API. See note below:
        // your current notifications schema associates notifications with employees.
        createNotification(employeeId, adminMessage),
      ]);

      const failedNotifications = notificationResults.filter(
        (item) => item.status === "rejected"
      );

      if (failedNotifications.length > 0) {
        setNotificationWarning(
          "Attendance was saved, but one or more notifications could not be saved."
        );
      }

      showBrowserNotification(
        "Attendance recorded",
        `${employeeName}: ${attendanceStatus} on ${dateLabel}.`
      );

      setSuccess(
        `Attendance saved for ${employeeName} as ${attendanceStatus}.`
      );

      await loadAttendance();
    } catch (err) {
      setError(
        attendanceSaved
          ? `Attendance was saved, but a follow-up action failed: ${err.message}`
          : err.message || "Unable to save attendance."
      );

      if (attendanceSaved) {
        await loadAttendance();
      }
    } finally {
      setSaving(false);
    }
  }

  const filteredRecords = records.filter((record) => {
    const name =
      `${record.first_name || ""} ${record.last_name || ""}`.trim();

    const query = search.toLowerCase();

    const matchesSearch =
      name.toLowerCase().includes(query) ||
      String(record.employee_id).includes(query);

    const matchesStatus =
      statusFilter === "all" ||
      String(record.status || "").toLowerCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const countStatus = (status) =>
    records.filter(
      (record) =>
        String(record.status || "").toLowerCase() === status.toLowerCase()
    ).length;

  return (
    <section className="attendance-page">
      <div className="employee-header">
        <div>
          <p className="eyebrow">WORKFORCE MANAGEMENT</p>
          <h1>Attendance Management</h1>
          <p>Manage employee attendance and daily work records.</p>
        </div>

        <div className="attendance-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={enableBrowserNotifications}
            disabled={saving}
          >
            Enable Browser Notifications
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={loadAttendance}
            disabled={loading || saving}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <section className="table-card attendance-form-card">
        <h2>Mark Employee Attendance</h2>

        <form onSubmit={handleSaveAttendance}>
          <div className="attendance-form-grid">
            <label>
              Employee
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                required
                disabled={employees.length === 0 || saving}
              >
                <option value="">Select employee</option>

                {employees.map((employee) => (
                  <option
                    key={employee.employee_id}
                    value={employee.employee_id}
                  >
                    {employee.first_name} {employee.last_name}
                    {" — ID "}
                    {employee.employee_id}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Attendance Date
              <input
                type="date"
                value={attendanceDate}
                max={todayString()}
                onChange={(event) => setAttendanceDate(event.target.value)}
                required
                disabled={saving}
              />
            </label>

            <label>
              Status
              <select
                value={attendanceStatus}
                onChange={(event) => setAttendanceStatus(event.target.value)}
                required
                disabled={saving}
              >
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Late">Late</option>
              </select>
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={saving || loading || employees.length === 0}
            >
              {saving ? "Saving..." : "Save Attendance"}
            </button>
          </div>
        </form>

        {employees.length === 0 && !loading && !error && (
          <p className="message">
            No employees found. Add an employee before marking attendance.
          </p>
        )}

        {error && (
          <div className="message error-message" role="alert">
            {error}
          </div>
        )}

        {success && (
          <p className="message success-message" role="status">
            {success}
          </p>
        )}

        {notificationWarning && (
          <p className="message error-message" role="status">
            {notificationWarning}
          </p>
        )}
      </section>

      <div className="stats-grid attendance-stats">
        <article className="stat-card">
          <span>Total Records</span>
          <strong>{records.length}</strong>
        </article>

        <article className="stat-card">
          <span>Present</span>
          <strong>{countStatus("Present")}</strong>
        </article>

        <article className="stat-card">
          <span>Absent</span>
          <strong>{countStatus("Absent")}</strong>
        </article>

        <article className="stat-card">
          <span>Late</span>
          <strong>{countStatus("Late")}</strong>
        </article>
      </div>

      <div className="table-card">
        <div className="employee-controls attendance-controls">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employee name or ID..."
            aria-label="Search attendance"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter attendance by status"
          >
            <option value="all">All statuses</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="late">Late</option>
            <option value="half day">Half Day</option>
            <option value="on leave">On Leave</option>
          </select>
        </div>

        {loading ? (
          <p className="message">Loading attendance records...</p>
        ) : (
          <div className="table-wrapper">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Date</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.attendance_id}>
                    <td>
                      <strong>
                        {record.first_name} {record.last_name}
                      </strong>
                    </td>
                    <td>{record.employee_id}</td>
                    <td>{formatDate(record.attendance_date)}</td>
                    <td>{formatTime(record.check_in)}</td>
                    <td>{formatTime(record.check_out)}</td>
                    <td>
                      <span
                        className={`attendance-status status-${String(
                          record.status || "unknown"
                        )
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")}`}
                      >
                        {record.status || "Unknown"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredRecords.length === 0 && (
              <p className="message">
                {records.length === 0
                  ? "No attendance records found in the database."
                  : "No attendance records match your search."}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
