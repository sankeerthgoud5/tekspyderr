
import { useCallback, useEffect, useState } from "react";
import "./LeaveRequests.css";

const LEAVE_TYPES = [
  "Casual Leave",
  "Sick Leave",
  "Annual Leave",
  "Emergency Leave",
];

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
}

function todayString() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

export default function LeaveRequests({ mode = "employee" }) {
  const isAdmin = mode === "admin";

  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState("Annual Leave");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadRequests = useCallback(async () => {
    const data = await apiRequest("/leave-requests");
    setRequests(Array.isArray(data) ? data : []);
  }, []);

  const loadEmployees = useCallback(async () => {
    const data = await apiRequest("/employees");

    if (!Array.isArray(data)) {
      throw new Error("Employees API did not return a list.");
    }

    setEmployees(data);

    // Automatically select the first employee if none is selected.
    setEmployeeId((currentId) => {
      const exists = data.some(
        (employee) => String(employee.employee_id) === String(currentId)
      );

      return exists
        ? currentId
        : data.length
          ? String(data[0].employee_id)
          : "";
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      setLoadingEmployees(true);
      setError("");

      try {
        const [employeeData, requestData] = await Promise.all([
          apiRequest("/employees"),
          apiRequest("/leave-requests"),
        ]);

        if (!active) return;

        if (!Array.isArray(employeeData)) {
          throw new Error("Employees API did not return a list.");
        }

        setEmployees(employeeData);
        setEmployeeId((currentId) => {
          const exists = employeeData.some(
            (employee) =>
              String(employee.employee_id) === String(currentId)
          );

          return exists
            ? currentId
            : employeeData.length
              ? String(employeeData[0].employee_id)
              : "";
        });

        setRequests(Array.isArray(requestData) ? requestData : []);
      } catch (err) {
        if (active) setError(err.message || "Unable to load data.");
      } finally {
        if (active) setLoadingEmployees(false);
      }
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!employeeId) {
      setError("No employees found. Please check the employees API.");
      return;
    }

    if (!leaveType || !startDate || !endDate || !reason.trim()) {
      setError("Please complete all fields.");
      return;
    }

    if (startDate < todayString()) {
      setError("Start date cannot be in the past.");
      return;
    }

    if (endDate < startDate) {
      setError("End date cannot be before the start date.");
      return;
    }

    setLoading(true);

    try {
      await apiRequest("/leave-requests", {
        method: "POST",
        body: JSON.stringify({
          employee_id: Number(employeeId),
          leave_type: leaveType,
          start_date: startDate,
          end_date: endDate,
          reason: reason.trim(),
        }),
      });

      setSuccess("Leave request submitted successfully. Status: Pending.");
      setLeaveType("Annual Leave");
      setStartDate("");
      setEndDate("");
      setReason("");
      await loadRequests();
    } catch (err) {
      setError(err.message || "Unable to submit leave request.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(requestId, status) {
    if (requestId == null) {
      setError("This request has no ID. Check the leave_requests table.");
      return;
    }

    const action = status === "approved" ? "approve" : "reject";

    if (!window.confirm(`Are you sure you want to ${action} this request?`)) {
      return;
    }

    setError("");
    setSuccess("");

    try {
      await apiRequest(
        `/leave-requests/${encodeURIComponent(requestId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );

      setSuccess(`Leave request ${status} successfully.`);
      await loadRequests();
    } catch (err) {
      setError(err.message || "Unable to update leave request.");
    }
  }

  function getRequestId(request) {
    return request.leave_request_id ?? request.id;
  }

  function getEmployeeName(request) {
    if (request.first_name || request.last_name) {
      return `${request.first_name || ""} ${request.last_name || ""}`.trim();
    }

    const employee = employees.find(
      (item) => Number(item.employee_id) === Number(request.employee_id)
    );

    return employee
      ? `${employee.first_name || ""} ${employee.last_name || ""}`.trim()
      : `Employee #${request.employee_id}`;
  }

  function getStatus(request) {
    return String(request.status || "pending").toLowerCase();
  }

  return (
    <div className="leave-page">
      <div className="leave-page-heading">
        <div>
          <p className="leave-eyebrow">HUMAN RESOURCES</p>
          <h1>{isAdmin ? "Leave Requests" : "Apply for Leave"}</h1>
          <p>
            {isAdmin
              ? "Review employee leave applications."
              : "Submit a leave request and track its approval status."}
          </p>
        </div>
      </div>

      {error && <div className="leave-alert leave-alert-error">{error}</div>}
      {success && (
        <div className="leave-alert leave-alert-success">{success}</div>
      )}

      {!isAdmin && (
        <section className="leave-card">
          <h2>Apply for Leave</h2>

          <form onSubmit={handleSubmit} className="leave-form">
            <label>
              Employee
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                disabled={loadingEmployees || loading || employees.length === 0}
                required
              >
                <option value="">
                  {loadingEmployees ? "Loading employees..." : "Select employee"}
                </option>

                {employees.map((employee) => (
                  <option
                    key={employee.employee_id}
                    value={String(employee.employee_id)}
                  >
                    {employee.first_name} {employee.last_name} — ID{" "}
                    {employee.employee_id}
                  </option>
                ))}
              </select>

              {!loadingEmployees && employees.length === 0 && (
                <small>No employees were returned by the API.</small>
              )}
            </label>

            <label>
              Leave Type
              <select
                value={leaveType}
                onChange={(event) => setLeaveType(event.target.value)}
                required
              >
                {LEAVE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <div className="leave-date-grid">
              <label>
                Start Date
                <input
                  type="date"
                  value={startDate}
                  min={todayString()}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStartDate(value);

                    if (endDate && value > endDate) {
                      setEndDate("");
                    }
                  }}
                  required
                />
              </label>

              <label>
                End Date
                <input
                  type="date"
                  value={endDate}
                  min={startDate || todayString()}
                  onChange={(event) => setEndDate(event.target.value)}
                  required
                />
              </label>
            </div>

            <label>
              Reason for Leave
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why you need leave..."
                rows={4}
                maxLength={1000}
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading || loadingEmployees || employees.length === 0}
            >
              {loading ? "Submitting..." : "Submit Leave Request"}
            </button>
          </form>
        </section>
      )}

      <section className="leave-card">
        <h2>{isAdmin ? "All Leave Requests" : "My Leave Requests"}</h2>

        {loadingEmployees ? (
          <p>Loading leave requests...</p>
        ) : requests.filter(
            (request) =>
              isAdmin ||
              (employeeId &&
                Number(request.employee_id) === Number(employeeId))
          ).length === 0 ? (
          <p>No leave requests found for this employee.</p>
        ) : (
          <div className="leave-table-wrapper">
            <table className="leave-table">
              <thead>
                <tr>
                  {isAdmin && <th>Employee</th>}
                  <th>Leave Type</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Reason</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {requests
                  .filter(
                    (request) =>
                      isAdmin ||
                      (employeeId &&
                        Number(request.employee_id) === Number(employeeId))
                  )
                  .map((request) => {
                    const status = getStatus(request);
                    const requestId = getRequestId(request);

                    return (
                      <tr key={requestId ?? `${request.employee_id}-${request.start_date}`}>
                        {isAdmin && <td>{getEmployeeName(request)}</td>}
                        <td>{request.leave_type || "—"}</td>
                        <td>{formatDate(request.start_date)}</td>
                        <td>{formatDate(request.end_date)}</td>
                        <td>{request.reason || "—"}</td>
                        <td>
                          <span className={`leave-status status-${status}`}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </span>
                        </td>

                        {isAdmin && (
                          <td>
                            {status === "pending" ? (
                              <div className="leave-actions">
                                <button
                                  type="button"
                                  onClick={() => handleReview(requestId, "approved")}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="leave-reject-button"
                                  onClick={() => handleReview(requestId, "rejected")}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              "Reviewed"
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
