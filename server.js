
const express = require("express");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// =====================================
// POSTGRESQL CONNECTION
// =====================================

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "tekspyder_workspace",
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL error:", error.message);
});

// =====================================
// SHARED HELPERS
// =====================================

function isValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// =====================================
// ROOT & DATABASE HEALTH
// =====================================

app.get("/", (req, res) => {
  res.json({
    message: "TekSpyder backend is running",
  });
});

app.get(
  "/api/health/db",
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      "SELECT current_database() AS database"
    );

    res.json({
      status: "ok",
      database: result.rows[0].database,
    });
  })
);

// =====================================
// EMPLOYEE APIs
// =====================================

// GET ALL EMPLOYEES
app.get(
  "/api/employees",
  asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT
        employee_id,
        first_name,
        last_name,
        email,
        phone,
        job_title,
        department_id,
        hire_date,
        created_at
      FROM public.employees
      ORDER BY employee_id ASC
    `);

    res.json(result.rows);
  })
);

// ADD EMPLOYEE
app.post(
  "/api/employees",
  asyncHandler(async (req, res) => {
    const {
      first_name,
      last_name,
      email,
      phone,
      job_title,
      hire_date,
      department_id,
    } = req.body;

    if (
      typeof first_name !== "string" ||
      !first_name.trim() ||
      typeof last_name !== "string" ||
      !last_name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof job_title !== "string" ||
      !job_title.trim() ||
      department_id === undefined ||
      department_id === null ||
      department_id === ""
    ) {
      return res.status(400).json({
        error: "Please fill in all required employee fields.",
      });
    }

    const departmentId = Number(department_id);

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({
        error: "Please select a valid department.",
      });
    }

    if (hire_date && !isValidDate(hire_date)) {
      return res.status(400).json({
        error: "Hire date must use a valid YYYY-MM-DD date.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const result = await pool.query(
        `INSERT INTO public.employees (
          first_name,
          last_name,
          email,
          phone,
          job_title,
          hire_date,
          department_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING
          employee_id,
          first_name,
          last_name,
          email,
          phone,
          job_title,
          department_id,
          hire_date,
          created_at`,
        [
          first_name.trim(),
          last_name.trim(),
          normalizedEmail,
          typeof phone === "string" ? phone.trim() || null : null,
          job_title.trim(),
          hire_date || null,
          departmentId,
        ]
      );

      return res.status(201).json({
        message: "Employee added successfully.",
        employee: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          error: "An employee with this email already exists.",
        });
      }

      if (error.code === "23503") {
        return res.status(400).json({
          error: "The selected department does not exist.",
        });
      }

      throw error;
    }
  })
);

// =====================================
// DEPARTMENT API
// =====================================

app.get(
  "/api/departments",
  asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT
        department_id,
        department_name,
        description,
        created_at
      FROM public.departments
      ORDER BY department_id ASC
    `);

    res.json(result.rows);
  })
);

// =====================================
// ATTENDANCE APIs
// =====================================

// GET ATTENDANCE WITH EMPLOYEE DETAILS
app.get(
  "/api/attendance",
  asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT
        a.attendance_id,
        a.employee_id,
        e.first_name,
        e.last_name,
        a.attendance_date,
        a.check_in,
        a.check_out,
        a.status
      FROM public.attendance AS a
      LEFT JOIN public.employees AS e
        ON e.employee_id = a.employee_id
      ORDER BY
        a.attendance_date DESC,
        a.check_in DESC NULLS LAST,
        a.attendance_id DESC
    `);

    res.json(result.rows);
  })
);

// MARK ATTENDANCE AND CREATE NOTIFICATION
app.post(
  "/api/attendance",
  asyncHandler(async (req, res) => {
    const { employee_id, attendance_date, status } = req.body;
    const employeeId = Number(employee_id);

    const allowedStatuses = ["present", "absent", "late"];

    if (
      employee_id === undefined ||
      employee_id === null ||
      employee_id === "" ||
      !Number.isInteger(employeeId) ||
      employeeId <= 0
    ) {
      return res.status(400).json({
        error: "Please select a valid employee.",
      });
    }

    if (!isValidDate(attendance_date)) {
      return res.status(400).json({
        error: "Please select a valid attendance date.",
      });
    }

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status.toLowerCase())
    ) {
      return res.status(400).json({
        error: "Status must be Present, Absent, or Late.",
      });
    }

    const normalizedStatus =
      status.toLowerCase()[0].toUpperCase() +
      status.toLowerCase().slice(1);

    let client;
    let transactionStarted = false;

    try {
      client = await pool.connect();

      await client.query("BEGIN");
      transactionStarted = true;

      // Lock the employee row during duplicate checking.
      const employeeResult = await client.query(
        `SELECT employee_id, first_name, last_name
         FROM public.employees
         WHERE employee_id = $1
         FOR UPDATE`,
        [employeeId]
      );

      if (employeeResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(404).json({
          error: "Employee not found.",
        });
      }

      const employee = employeeResult.rows[0];

      // Avoid duplicate records for the same employee and date.
      const existingResult = await client.query(
        `SELECT attendance_id
         FROM public.attendance
         WHERE employee_id = $1
           AND attendance_date = $2
         LIMIT 1`,
        [employeeId, attendance_date]
      );

      if (existingResult.rows.length > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          error:
            "Attendance is already recorded for this employee on this date.",
        });
      }

      // Save attendance.
      const attendanceResult = await client.query(
        `INSERT INTO public.attendance (
          employee_id,
          attendance_date,
          status
        )
        VALUES ($1, $2, $3)
        RETURNING
          attendance_id,
          employee_id,
          attendance_date,
          check_in,
          check_out,
          status`,
        [employeeId, attendance_date, normalizedStatus]
      );

      const employeeName =
        `${employee.first_name} ${employee.last_name}`.trim();

      // Create an in-app notification for the employee.
      const employeeMessage =
        `Your attendance for ${attendance_date} has been marked ${normalizedStatus}.`;

      const notificationResult = await client.query(
        `INSERT INTO public.notifications (
          employee_id,
          message
        )
        VALUES ($1, $2)
        RETURNING
          notification_id,
          employee_id,
          message,
          is_read,
          created_at`,
        [employeeId, employeeMessage]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(201).json({
        message:
          "Attendance saved and notification created successfully.",
        attendance: {
          ...attendanceResult.rows[0],
          first_name: employee.first_name,
          last_name: employee.last_name,
        },
        notification: {
          ...notificationResult.rows[0],
          first_name: employee.first_name,
          last_name: employee.last_name,
        },
        browserNotification: {
          title: "TekSpyder Attendance",
          body: `${employeeName} (ID ${employeeId}) was marked ${normalizedStatus} for ${attendance_date}.`,
        },
      });
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error(
            "Attendance rollback failed:",
            rollbackError.message
          );
        }
      }

      if (error.code === "23505") {
        return res.status(409).json({
          error:
            "Attendance already exists for this employee and date.",
        });
      }

      throw error;
    } finally {
      if (client) client.release();
    }
  })
);

// =====================================
// LEAVE REQUEST APIs
// =====================================

// SUBMIT LEAVE REQUEST
app.post(
  "/api/leave-requests",
  asyncHandler(async (req, res) => {
    const {
      employee_id,
      leave_type,
      start_date,
      end_date,
      reason,
    } = req.body;

    const employeeId = Number(employee_id);

    if (
      employee_id === undefined ||
      employee_id === null ||
      employee_id === "" ||
      !Number.isInteger(employeeId) ||
      employeeId <= 0 ||
      typeof leave_type !== "string" ||
      !leave_type.trim() ||
      typeof reason !== "string" ||
      !reason.trim() ||
      !start_date ||
      !end_date
    ) {
      return res.status(400).json({
        error:
          "Employee, leave type, start date, end date, and reason are required.",
      });
    }

    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        error: "Dates must be valid and use YYYY-MM-DD format.",
      });
    }

    if (end_date < start_date) {
      return res.status(400).json({
        error: "End date cannot be before start date.",
      });
    }

    const employeeResult = await pool.query(
      `SELECT employee_id
       FROM public.employees
       WHERE employee_id = $1`,
      [employeeId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        error: `Employee ID ${employeeId} was not found.`,
      });
    }

    const result = await pool.query(
      `INSERT INTO public.leave_requests (
        employee_id,
        leave_type,
        start_date,
        end_date,
        reason,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING *`,
      [
        employeeId,
        leave_type.trim(),
        start_date,
        end_date,
        reason.trim(),
      ]
    );

    return res.status(201).json({
      message: "Leave request submitted successfully.",
      leaveRequest: result.rows[0],
    });
  })
);

// GET LEAVE REQUESTS WITH EMPLOYEE DETAILS
app.get(
  "/api/leave-requests",
  asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT
        lr.*,
        e.first_name,
        e.last_name,
        e.email
      FROM public.leave_requests AS lr
      LEFT JOIN public.employees AS e
        ON e.employee_id = lr.employee_id
      ORDER BY lr.created_at DESC NULLS LAST
    `);

    res.json(result.rows);
  })
);

// APPROVE OR REJECT LEAVE REQUEST
app.patch(
  "/api/leave-requests/:id/status",
  asyncHandler(async (req, res) => {
    const requestId = Number(req.params.id);

    const status =
      typeof req.body.status === "string"
        ? req.body.status.toLowerCase()
        : "";

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        error: "Invalid leave request ID.",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        error: 'Status must be "approved" or "rejected".',
      });
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const requestResult = await client.query(
        `SELECT *
         FROM public.leave_requests
         WHERE leave_request_id = $1
         FOR UPDATE`,
        [requestId]
      );

      if (requestResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(404).json({
          error: "Leave request not found.",
        });
      }

      const leaveRequest = requestResult.rows[0];

      if (String(leaveRequest.status).toLowerCase() !== "pending") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          error: "This request has already been reviewed.",
          currentStatus: leaveRequest.status,
        });
      }

      const updateResult = await client.query(
        `UPDATE public.leave_requests
         SET status = $1,
             reviewed_at = CURRENT_TIMESTAMP
         WHERE leave_request_id = $2
         RETURNING *`,
        [status, requestId]
      );

      if (leaveRequest.employee_id) {
        const message =
          status === "approved"
            ? `Your leave request #${requestId} has been approved.`
            : `Your leave request #${requestId} has been rejected.`;

        await client.query(
          `INSERT INTO public.notifications (
            employee_id,
            message
          )
          VALUES ($1, $2)`,
          [leaveRequest.employee_id, message]
        );
      }

      await client.query("COMMIT");
      transactionStarted = false;

      return res.json({
        message: `Leave request ${status} successfully.`,
        leaveRequest: updateResult.rows[0],
      });
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError.message);
        }
      }

      throw error;
    } finally {
      client.release();
    }
  })
);

// =====================================
// NOTIFICATION APIs
// =====================================

// GET NOTIFICATIONS WITH EMPLOYEE DETAILS
app.get(
  "/api/notifications",
  asyncHandler(async (req, res) => {
    const result = await pool.query(`
      SELECT
        n.notification_id,
        n.employee_id,
        e.first_name,
        e.last_name,
        n.message,
        n.is_read,
        n.created_at
      FROM public.notifications AS n
      LEFT JOIN public.employees AS e
        ON e.employee_id = n.employee_id
      ORDER BY n.created_at DESC NULLS LAST
    `);

    res.json(result.rows);
  })
);

// CREATE NOTIFICATION
app.post(
  "/api/notifications",
  asyncHandler(async (req, res) => {
    const { employee_id, message } = req.body;
    const employeeId = Number(employee_id);

    if (
      employee_id === undefined ||
      employee_id === null ||
      employee_id === "" ||
      !Number.isInteger(employeeId) ||
      employeeId <= 0 ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "Valid employee_id and message are required.",
      });
    }

    const employeeResult = await pool.query(
      `SELECT employee_id
       FROM public.employees
       WHERE employee_id = $1`,
      [employeeId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(404).json({
        error: "Employee not found.",
      });
    }

    const result = await pool.query(
      `INSERT INTO public.notifications (
        employee_id,
        message
      )
      VALUES ($1, $2)
      RETURNING notification_id`,
      [employeeId, message.trim()]
    );

    const notificationResult = await pool.query(
      `SELECT
        n.notification_id,
        n.employee_id,
        e.first_name,
        e.last_name,
        n.message,
        n.is_read,
        n.created_at
       FROM public.notifications AS n
       LEFT JOIN public.employees AS e
         ON e.employee_id = n.employee_id
       WHERE n.notification_id = $1`,
      [result.rows[0].notification_id]
    );

    return res.status(201).json({
      message: "Notification created successfully.",
      notification: notificationResult.rows[0],
    });
  })
);

// MARK NOTIFICATION AS READ
app.patch(
  "/api/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({
        error: "Invalid notification ID.",
      });
    }

    const result = await pool.query(
      `UPDATE public.notifications
       SET is_read = TRUE
       WHERE notification_id = $1
       RETURNING notification_id`,
      [notificationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Notification not found.",
      });
    }

    const notificationResult = await pool.query(
      `SELECT
        n.notification_id,
        n.employee_id,
        e.first_name,
        e.last_name,
        n.message,
        n.is_read,
        n.created_at
       FROM public.notifications AS n
       LEFT JOIN public.employees AS e
         ON e.employee_id = n.employee_id
       WHERE n.notification_id = $1`,
      [notificationId]
    );

    return res.json({
      message: "Notification marked as read.",
      notification: notificationResult.rows[0],
    });
  })
);

// =====================================
// CENTRAL ERROR HANDLER
// =====================================

app.use((error, req, res, next) => {
  console.error("API error:", error.message);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    error: "Internal server error.",
    details:
      process.env.NODE_ENV === "production"
        ? undefined
        : error.message,
  });
});

// =====================================
// 404 HANDLER - KEEP THIS LAST
// =====================================

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// =====================================
// START SERVER
// =====================================

async function startServer() {
  try {
    await pool.query("SELECT 1");

    app.listen(PORT, () => {
      console.log(
        `TekSpyder backend running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Unable to connect to PostgreSQL:",
      error.message
    );

    process.exitCode = 1;
  }
}

startServer();
