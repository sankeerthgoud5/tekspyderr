
import { useEffect, useState } from "react";

export default function EmployeeDirectory() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [employeesResponse, departmentsResponse] =
          await Promise.all([
            fetch("/api/employees"),
            fetch("/api/departments"),
          ]);

        if (!employeesResponse.ok) {
          throw new Error("Failed to load employees");
        }

        if (!departmentsResponse.ok) {
          throw new Error("Failed to load departments");
        }

        const employeesData = await employeesResponse.json();
        const departmentsData = await departmentsResponse.json();

        setEmployees(employeesData);
        setDepartments(departmentsData);
      } catch (err) {
        setError(err.message || "Unable to load employee data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  function getDepartmentName(departmentId) {
    const department = departments.find(
      (item) =>
        Number(item.department_id) === Number(departmentId)
    );

    return department?.department_name || "Unassigned";
  }

  if (loading) {
    return <p>Loading employees...</p>;
  }

  if (error) {
    return <p style={{ color: "red" }}>{error}</p>;
  }

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <h2>Employee Directory</h2>

      {employees.length === 0 ? (
        <p>No employees found.</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            textAlign: "left",
          }}
        >
          <thead>
            <tr>
              <th style={cellStyle}>Employee</th>
              <th style={cellStyle}>Job Title</th>
              <th style={cellStyle}>Department</th>
              <th style={cellStyle}>Email</th>
            </tr>
          </thead>

          <tbody>
            {employees.map((employee) => (
              <tr key={employee.employee_id}>
                <td style={cellStyle}>
                  <strong>
                    {employee.first_name} {employee.last_name}
                  </strong>
                  <br />
                  <small>ID: {employee.employee_id}</small>
                </td>

                <td style={cellStyle}>
                  {employee.job_title || "Not specified"}
                </td>

                <td style={cellStyle}>
                  {getDepartmentName(employee.department_id)}
                </td>

                <td style={cellStyle}>
                  {employee.email || "No email"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const cellStyle = {
  padding: "16px",
  borderBottom: "1px solid #e5e7eb",
};
