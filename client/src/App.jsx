
import { useEffect, useState } from "react";
import "./App.css";
import LeaveRequests from "./LeaveRequests";
import Attendance from "./Attendance.jsx";
import Notifications from "./Notifications";

const API_URL = "/api/employees";
const DEPARTMENTS_URL = "/api/departments";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  job_title: "",
  hire_date: "",
  department_id: "",
};

const PAGE_TITLES = {
  dashboard: "HR Dashboard",
  employees: "Employees",
  attendance: "Attendance",
  "leave-requests": "Apply for Leave",
  "leave-approvals": "Leave Approvals",
  notifications: "Notifications",
  settings: "Settings",
};

function App() {
  const [activePage, setActivePage] = useState("dashboard");

  const [employees, setEmployees] = useState([]);
  const [departmentsList, setDepartmentsList] = useState([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [departmentsError, setDepartmentsError] = useState("");

  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });

  async function loadEmployees() {
    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error("Unable to load employee records.");
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("The employee API returned an invalid response.");
      }

      setEmployees(data);
      setError("");
    } catch (err) {
      console.error("Employee loading error:", err);
      setError(
        "Could not load employees. Make sure the backend is running on port 5000."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadDepartments() {
    try {
      const response = await fetch(DEPARTMENTS_URL);

      if (!response.ok) {
        throw new Error("Unable to load departments.");
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("The departments API returned an invalid response.");
      }

      setDepartmentsList(data);
      setDepartmentsError("");
    } catch (err) {
      console.error("Department loading error:", err);
      setDepartmentsError(
        "Departments could not be loaded. Check the backend department API."
      );
    }
  }

  useEffect(() => {
    loadEmployees();
    loadDepartments();
  }, []);

  function getDepartmentName(departmentId) {
    if (departmentId === null || departmentId === undefined) {
      return "Unassigned";
    }

    const department = departmentsList.find(
      (item) => Number(item.department_id) === Number(departmentId)
    );

    return department?.department_name || "Unassigned";
  }

  const departments = [
    ...new Set(
      employees
        .map((employee) => getDepartmentName(employee.department_id))
        .filter((name) => name !== "Unassigned")
    ),
  ];

  const filteredEmployees = employees.filter((employee) => {
    const term = search.trim().toLowerCase();
    const departmentName = getDepartmentName(employee.department_id);

    const searchableValues = [
      employee.first_name,
      employee.last_name,
      employee.email,
      employee.job_title,
      departmentName,
    ];

    const matchesSearch = searchableValues.some((value) =>
      String(value || "").toLowerCase().includes(term)
    );

    const matchesDepartment =
      departmentFilter === "All" ||
      departmentName === departmentFilter;

    return matchesSearch && matchesDepartment;
  });

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function openAddEmployee() {
    setForm({ ...EMPTY_FORM });
    setFormError("");
    setSuccessMessage("");
    setShowAddEmployee(true);
  }

  function closeAddEmployee() {
    if (saving) return;

    setShowAddEmployee(false);
    setFormError("");
  }

  async function handleAddEmployee(event) {
    event.preventDefault();

    if (!form.department_id) {
      setFormError("Please select a department.");
      return;
    }

    setSaving(true);
    setFormError("");
    setSuccessMessage("");

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          job_title: form.job_title.trim(),
          hire_date: form.hire_date || null,
          department_id: Number(form.department_id),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error || result.message || "Unable to add employee."
        );
      }

      setShowAddEmployee(false);
      setForm({ ...EMPTY_FORM });
      setSuccessMessage("Employee added successfully!");
      setActivePage("employees");

      await loadEmployees();
      await loadDepartments();
    } catch (err) {
      console.error("Add employee error:", err);
      setFormError(
        err.message || "Something went wrong while adding the employee."
      );
    } finally {
      setSaving(false);
    }
  }

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: "▦" },
    { id: "employees", label: "Employees", icon: "♙" },
    { id: "attendance", label: "Attendance", icon: "◷" },
    { id: "leave-requests", label: "Apply for Leave", icon: "▣" },
    { id: "leave-approvals", label: "Leave Approvals", icon: "✓" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <h2 className="brand">TekSpyder</h2>

        <p className="workspace-label">WORKSPACE</p>

        <nav aria-label="Main navigation">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => {
                setActivePage(item.id);
                setSuccessMessage("");
              }}
              aria-current={activePage === item.id ? "page" : undefined}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">HUMAN RESOURCES</p>
            <h1>{PAGE_TITLES[activePage]}</h1>
          </div>

          <div className="topbar-actions">
            <Notifications
              onOpenPage={() => setActivePage("notifications")}
            />
            <div className="profile">HR Admin</div>
          </div>
        </header>

        {/* DASHBOARD PAGE */}
        {activePage === "dashboard" && (
          <>
            <section className="welcome">
              <div>
                <p className="eyebrow light">TEKSPYDER WORKSPACE</p>
                <h2>Welcome to your HR workspace</h2>
                <p>Manage your people, departments and workforce.</p>
              </div>

              <div className="welcome-icon">✦</div>
            </section>

            <section className="stats">
              <article className="stat-card">
                <span className="stat-icon blue">♙</span>
                <p>Total Employees</p>
                <h2>{loading ? "…" : error ? "—" : employees.length}</h2>
                <span className="muted">Employee records</span>
              </article>

              <article className="stat-card">
                <span className="stat-icon purple">▦</span>
                <p>Departments</p>
                <h2>
                  {departmentsError ? "—" : departmentsList.length}
                </h2>
                <span className="muted">Available departments</span>
              </article>

              <article className="stat-card">
                <span className="stat-icon green">✓</span>
                <p>API Status</p>
                <h2 className="status-text">
                  {loading ? "Checking" : error ? "Offline" : "Connected"}
                </h2>
                <span className="muted">Employee service</span>
              </article>
            </section>

            <section className="table-card">
              <div className="employee-header">
                <div>
                  <h2>Quick Access</h2>
                  <p>Choose a section to manage your workspace.</p>
                </div>
              </div>

              <div className="quick-actions">
                <button
                  type="button"
                  className="add-employee-btn"
                  onClick={() => setActivePage("employees")}
                >
                  View Employees
                </button>

                <button
                  type="button"
                  className="add-employee-btn"
                  onClick={() => setActivePage("attendance")}
                >
                  View Attendance
                </button>

                <button
                  type="button"
                  className="add-employee-btn"
                  onClick={() => setActivePage("leave-requests")}
                >
                  Apply for Leave
                </button>

                <button
                  type="button"
                  className="add-employee-btn"
                  onClick={() => setActivePage("leave-approvals")}
                >
                  Review Leave Requests
                </button>
              </div>
            </section>
          </>
        )}

        {/* EMPLOYEES PAGE */}
        {activePage === "employees" && (
          <>
            {successMessage && (
              <div className="success-message" role="status">
                {successMessage}
              </div>
            )}

            <section className="table-card">
              <div className="employee-header">
                <div>
                  <h2>Employee Directory</h2>
                  <p>
                    Employee information from your PostgreSQL database
                  </p>
                </div>

                <div className="employee-header-actions">
                  <span className="count">
                    {filteredEmployees.length} records
                  </span>

                  <button
                    type="button"
                    className="add-employee-btn"
                    onClick={openAddEmployee}
                  >
                    + Add Employee
                  </button>
                </div>
              </div>

              <div className="employee-controls">
                <input
                  type="text"
                  placeholder="Search name, email or job title..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search employees"
                />

                <select
                  value={departmentFilter}
                  onChange={(event) => setDepartmentFilter(event.target.value)}
                  aria-label="Filter by department"
                >
                  <option value="All">All Departments</option>

                  {departments.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="message error">
                  <p>{error}</p>
                  <button type="button" onClick={loadEmployees}>
                    Try Again
                  </button>
                </div>
              )}

              {departmentsError && (
                <div className="message error">
                  <p>{departmentsError}</p>
                  <button type="button" onClick={loadDepartments}>
                    Retry Departments
                  </button>
                </div>
              )}

              {loading && <p className="message">Loading employees...</p>}

              {!loading && !error && (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>EMPLOYEE</th>
                        <th>JOB TITLE</th>
                        <th>DEPARTMENT</th>
                        <th>EMAIL</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredEmployees.map((employee) => (
                        <tr key={employee.employee_id}>
                          <td>
                            <div className="employee">
                              <span className="avatar">
                                {employee.first_name?.[0] || ""}
                                {employee.last_name?.[0] || ""}
                              </span>

                              <div>
                                <strong>
                                  {employee.first_name} {employee.last_name}
                                </strong>
                                <small>ID: {employee.employee_id}</small>
                              </div>
                            </div>
                          </td>

                          <td>{employee.job_title || "—"}</td>

                          <td>
                            <span className="department">
                              {getDepartmentName(employee.department_id)}
                            </span>
                          </td>

                          <td>{employee.email || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {filteredEmployees.length === 0 && (
                    <p className="message">No matching employees found.</p>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* ATTENDANCE PAGE */}
        {activePage === "attendance" && (
          <section className="table-card">
            <Attendance />
          </section>
        )}

        {/* EMPLOYEE LEAVE APPLICATION PAGE */}
        {activePage === "leave-requests" && (
          <section className="table-card">
            <LeaveRequests mode="employee" />
          </section>
        )}

        {/* ADMIN LEAVE APPROVALS PAGE */}
        {activePage === "leave-approvals" && (
          <section className="table-card">
            <LeaveRequests mode="admin" />
          </section>
        )}

        {/* NOTIFICATIONS PAGE */}
        {activePage === "notifications" && <Notifications page />}

        {/* SETTINGS PAGE */}
        {activePage === "settings" && (
          <section className="table-card">
            <div className="employee-header">
              <div>
                <h2>Settings</h2>
                <p>Application settings and workspace information.</p>
              </div>
            </div>

            <div className="settings-content">
              <h3>Workspace Information</h3>
              <p>
                <strong>Application:</strong> TekSpyder HR Management System
              </p>
              <p>
                <strong>Role:</strong> HR Admin
              </p>
              <p>
                <strong>Employee service:</strong>{" "}
                {loading
                  ? "Checking connection..."
                  : error
                    ? "Connection unavailable"
                    : "Connected"}
              </p>
            </div>
          </section>
        )}

        <footer>TekSpyder Workspace · HR Management System</footer>
      </main>

      {/* ADD EMPLOYEE MODAL */}
      {showAddEmployee && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeAddEmployee();
            }
          }}
        >
          <section
            className="employee-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-employee-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">EMPLOYEE MANAGEMENT</p>
                <h2 id="add-employee-title">Add New Employee</h2>
                <p>Enter the employee details below.</p>
              </div>

              <button
                type="button"
                className="close-modal"
                onClick={closeAddEmployee}
                disabled={saving}
                aria-label="Close form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddEmployee}>
              <div className="form-grid">
                <label>
                  First Name *
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={handleFormChange}
                    placeholder="e.g. Rahul"
                    autoComplete="given-name"
                    required
                  />
                </label>

                <label>
                  Last Name *
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={handleFormChange}
                    placeholder="e.g. Kumar"
                    autoComplete="family-name"
                    required
                  />
                </label>

                <label>
                  Email *
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleFormChange}
                    placeholder="employee@example.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label>
                  Phone
                  <input
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={handleFormChange}
                    placeholder="Phone number"
                    autoComplete="tel"
                  />
                </label>

                <label>
                  Job Title *
                  <input
                    name="job_title"
                    value={form.job_title}
                    onChange={handleFormChange}
                    placeholder="e.g. Software Developer"
                    required
                  />
                </label>

                <label>
                  Department *
                  <select
                    name="department_id"
                    value={form.department_id}
                    onChange={handleFormChange}
                    required
                    disabled={departmentsList.length === 0}
                  >
                    <option value="">Select department</option>

                    {departmentsList.map((department) => (
                      <option
                        key={department.department_id}
                        value={department.department_id}
                      >
                        {department.department_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="full-width">
                  Hire Date
                  <input
                    name="hire_date"
                    type="date"
                    value={form.hire_date}
                    onChange={handleFormChange}
                  />
                </label>
              </div>

              {departmentsError && (
                <p className="message error">{departmentsError}</p>
              )}

              {formError && (
                <p className="message error" role="alert">
                  {formError}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={closeAddEmployee}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="add-employee-btn"
                  disabled={saving || departmentsList.length === 0}
                >
                  {saving ? "Saving..." : "Save Employee"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
