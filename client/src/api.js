
const API_BASE = "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.details ||
        data.error ||
        data.message ||
        `Request failed: ${response.status}`
    );
  }

  return data;
}

// EMPLOYEES

export function getEmployees() {
  return request("/employees");
}

export function addEmployee(employee) {
  return request("/employees", {
    method: "POST",
    body: JSON.stringify(employee),
  });
}

// DEPARTMENTS

export function getDepartments() {
  return request("/departments");
}

// LEAVE REQUESTS

export function getLeaveRequests() {
  return request("/leave-requests");
}

export function createLeaveRequest(leaveRequest) {
  return request("/leave-requests", {
    method: "POST",
    body: JSON.stringify(leaveRequest),
  });
}

export function updateLeaveStatus(id, status) {
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Status must be approved or rejected.");
  }

  return request(`/leave-requests/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ATTENDANCE
// These functions require matching backend endpoints.
// They will not work until the routes are implemented in server.js.

export function getAttendance() {
  return request("/attendance");
}

export function createAttendance(attendance) {
  return request("/attendance", {
    method: "POST",
    body: JSON.stringify(attendance),
  });
}
export function updateAttendance(id, attendance) {
  return request(`/attendance/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(attendance),
  });
}

export async function getNotifications() {
  return request("/notifications");
}

export async function markNotificationAsRead(id) {
  return request(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
  });
}

// HEALTH CHECK

export function checkDatabaseHealth() {
  return request("/health/db");
}
