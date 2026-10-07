const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://poyinkklujutegvusjkl.supabase.co";

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY;

const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || "AL741774";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "Aradhya@123";

const months = [
  "January", "February", "March",
  "April", "May", "June",
  "July", "August", "September",
  "October", "November", "December"
];

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!SUPABASE_KEY) {
  console.error("SUPABASE_SECRET_KEY is missing.");
}

async function supabaseRequest(table, options = {}) {

  const {
    method = "GET",
    query = "",
    body
  } = options;

  const url =
    `${SUPABASE_URL}/rest/v1/${table}${query}`;

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };

  const response = await fetch(url, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body)
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {

    console.error(
      "SUPABASE ERROR:",
      response.status,
      data
    );

    throw new Error(
      data?.message ||
      data?.hint ||
      "Supabase request failed."
    );
  }

  return data;
}

/* =========================
   INDIA TIME
========================= */

function indiaNow() {
  return new Date();
}

function indiaDate() {

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).format(indiaNow());
}

function indiaYear() {

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      year: "numeric"
    }
  ).format(indiaNow());
}

function indiaTime() {

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }
  ).format(indiaNow());
}

/* =========================
   HELPERS
========================= */

function normalizeObject(value) {

  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function emptyFee() {

  return {
    amount: 700,
    status: "DUE",
    paidDate: "",
    paymentDate: "",
    paymentMode: "",
    receiptNumber: "",
    receiptUrl: "",
    admissionStatus: "OPEN"
  };
}

function createMonthlyFees() {

  const fees = {};

  months.forEach(month => {
    fees[month] = {
      ...emptyFee()
    };
  });

  return fees;
}

function normalizeFees(value) {

  const fees = normalizeObject(value);

  months.forEach(month => {

    if (!fees[month]) {

      fees[month] = {
        ...emptyFee()
      };

    } else {

      fees[month] = {
        ...emptyFee(),
        ...fees[month]
      };
    }
  });

  return fees;
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

/* =========================
   ENROLLMENT
========================= */

function generateEnrollmentNumber(
  students
) {

  let highest = 0;

  for (const student of students) {

    const match = String(
      student.enrollment_number || ""
    ).match(
      /^AR2026(\d{4})$/
    );

    if (match) {

      highest = Math.max(
        highest,
        Number(match[1])
      );
    }
  }

  return (
    "AR2026" +
    String(highest + 1)
      .padStart(4, "0")
  );
}

/* =========================
   RECEIPT NUMBER
========================= */

function generateReceiptNumber() {

  const stamp =
    Date.now()
      .toString()
      .slice(-7);

  return `AL-FEE-${indiaYear()}-${stamp}`;
}

/* =========================
   FIND STUDENT
========================= */

function findStudentQuery(id) {

  const value =
    String(id || "").trim();

  if (
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(
      value
    )
  ) {

    return (
      "?id=eq." +
      encodeURIComponent(value) +
      "&limit=1"
    );
  }

  return (
    "?enrollment_number=eq." +
    encodeURIComponent(value) +
    "&limit=1"
  );
}

async function getStudent(id) {

  const rows =
    await supabaseRequest(
      "students",
      {
        query:
          findStudentQuery(id)
      }
    );

  return rows?.[0] || null;
}

async function getAllStudents() {

  return await supabaseRequest(
    "students",
    {
      query:
        "?select=*&order=created_at.asc"
    }
  );
}

/* =========================
   YEAR DATA
========================= */

function migrateYearData(student) {

  const currentYear =
    String(indiaYear());

  const monthlyFees =
    normalizeFees(
      student.monthly_fees
    );

  const feesByYear =
    normalizeObject(
      student.fees_by_year
    );

  const attendance =
    normalizeObject(
      student.attendance_data
    );

  if (
    !feesByYear["2026"] ||
    typeof feesByYear["2026"] !==
      "object"
  ) {

    feesByYear["2026"] =
      clone(monthlyFees);
  }

  if (
    !feesByYear[currentYear] ||
    typeof feesByYear[currentYear] !==
      "object"
  ) {

    if (currentYear === "2026") {

      feesByYear[currentYear] =
        clone(monthlyFees);

    } else {

      feesByYear[currentYear] = {};
    }
  }

  return {
    monthlyFees,
    feesByYear,
    attendance
  };
}

/* =========================
   PUBLIC STUDENT
========================= */

function publicStudent(student) {

  const migrated =
    migrateYearData(student);

  const currentYear =
    String(indiaYear());

  const currentFees =
    migrated.feesByYear[currentYear] ||
    migrated.monthlyFees;

  return {

    id:
      student.enrollment_number,

    enrollmentNumber:
      student.enrollment_number,

    fullName:
      student.full_name,

    address:
      student.address,

    mobile:
      student.mobile,

    registrationDate:
      student.admission_date || "",

    seatNumber:
      student.seat_number || "",

    status:
      student.status || "ACTIVE",

    monthlyFees:
      currentFees,

    feesByYear:
      migrated.feesByYear,

    attendance:
      migrated.attendance,

    createdAt:
      student.created_at || ""
  };
}

/* =========================
   ADMIN AUTH
========================= */

function adminAuth(
  req,
  res,
  next
) {

  const token =
    String(
      req.headers.authorization || ""
    )
      .replace(
        /^Bearer\s+/i,
        ""
      )
      .trim();

  if (
    !token ||
    (
      !token.startsWith("ADMIN-") &&
      token !==
        "ARADHYA_ADMIN_ACCESS"
    )
  ) {

    return res.status(401).json({
      success: false,
      message:
        "Admin login required."
    });
  }

  next();
}

/* =========================
   PATCH STUDENT
   IMPORTANT SAVE FIX
========================= */

async function patchStudent(
  student,
  body
) {

  const studentId =
    String(student.id).trim();

  console.log(
    "SAVE STUDENT ID:",
    studentId
  );

  console.log(
    "SAVE DATA:",
    body
  );

  const updated =
    await supabaseRequest(
      "students",
      {
        method: "PATCH",

        query:
          "?id=eq." +
          encodeURIComponent(
            studentId
          ) +
          "&select=*",

        body: {
          ...body,

          updated_at:
            new Date().toISOString()
        }
      }
    );

  console.log(
    "SUPABASE UPDATED ROWS:",
    Array.isArray(updated)
      ? updated.length
      : 0
  );

  if (
    !Array.isArray(updated) ||
    updated.length === 0
  ) {

    throw new Error(
      "Supabase ne student ko update nahi kiya."
    );
  }

  return updated;
}

/* =========================
   HEALTH
========================= */

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      success: true,

      message:
        "Aradhya Library API is running.",

      database:
        "Supabase"
    });
  }
);

/* =========================
   ADMIN LOGIN
========================= */

app.post(
  "/api/admin/login",
  (req, res) => {

    const {
      username,
      password
    } = req.body || {};

    if (
      username === ADMIN_USERNAME &&
      password === ADMIN_PASSWORD
    ) {

      return res.json({

        success: true,

        username:
          ADMIN_USERNAME,

        token:
          "ADMIN-" +
          Date.now(),

        message:
          "Admin Login Successful!"
      });
    }

    return res.status(401).json({

      success: false,

      message:
        "Invalid Admin Username or Password."
    });
  }
);

/* =========================
   REGISTER
========================= */

app.post(
  "/api/register",
  async (req, res) => {

    try {

      const {
        fullName,
        address,
        mobile,
        password
      } = req.body || {};

      if (
        !fullName ||
        !address ||
        !mobile ||
        !password
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Please fill all required fields."
        });
      }

      if (
        !/^[6-9]\d{9}$/.test(
          String(mobile)
        )
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Enter a valid 10-digit Indian mobile number."
        });
      }

      if (
        String(password).length < 6
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters."
        });
      }

      const existing =
        await supabaseRequest(
          "students",
          {
            query:
              "?mobile=eq." +
              encodeURIComponent(
                String(mobile)
              ) +
              "&limit=1"
          }
        );

      if (existing.length) {

        return res.status(409).json({
          success: false,
          message:
            "Mobile number already registered."
        });
      }

      const students =
        await getAllStudents();

      const enrollmentNumber =
        generateEnrollmentNumber(
          students
        );

      const passwordHash =
        await bcrypt.hash(
          String(password),
          10
        );

      const year =
        String(indiaYear());

      const fees =
        createMonthlyFees();

      const newStudent = {

        enrollment_number:
          enrollmentNumber,

        full_name:
          String(fullName).trim(),

        mobile:
          String(mobile).trim(),

        password_hash:
          passwordHash,

        address:
          String(address).trim(),

        seat_number:
          "",

        admission_date:
          indiaDate(),

        status:
          "ACTIVE",

        monthly_fees:
          fees,

        fees_by_year: {
          [year]:
            clone(fees)
        },

        attendance_data:
          {}
      };

      const inserted =
        await supabaseRequest(
          "students",
          {
            method: "POST",
            body:
              newStudent
          }
        );

      const student =
        inserted?.[0];

      return res.status(201).json({

        success: true,

        message:
          "Registration successful!",

        enrollmentNumber,

        student:
          publicStudent(student)
      });

    } catch (error) {

      console.error(
        "REGISTER ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Registration failed.",

        error:
          error.message
      });
    }
  }
);
/* =========================
   STUDENT LOGIN
========================= */

app.post(
  "/api/login",
  async (req, res) => {

    try {

      const {
        enrollmentNumber,
        password
      } = req.body || {};

      if (
        !enrollmentNumber ||
        !password
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Enrollment Number and Password are required."
        });
      }

      const student =
        await getStudent(
          enrollmentNumber
        );

      if (!student) {

        return res.status(401).json({
          success: false,
          message:
            "Invalid Enrollment Number or Password."
        });
      }

      const valid =
        await bcrypt.compare(
          String(password),
          String(
            student.password_hash
          )
        );

      if (!valid) {

        return res.status(401).json({
          success: false,
          message:
            "Invalid Enrollment Number or Password."
        });
      }

      return res.json({

        success: true,

        message:
          "Login Successful!",

        student:
          publicStudent(student)
      });

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Login server error."
      });
    }
  }
);


/* =========================
   STUDENT DATA
========================= */

app.get(
  "/api/student/:id",
  async (req, res) => {

    try {

      const student =
        await getStudent(
          req.params.id
        );

      if (!student) {

        return res.status(404).json({
          success: false,
          message:
            "Student not found."
        });
      }

      return res.json({

        success: true,

        student:
          publicStudent(student)
      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        message:
          "Could not load student."
      });
    }
  }
);


/* =========================
   ADMIN ALL STUDENTS
========================= */

app.get(
  "/api/admin/students",
  adminAuth,
  async (req, res) => {

    try {

      const students =
        await getAllStudents();

      return res.json({

        success: true,

        students:
          students.map(
            publicStudent
          )
      });

    } catch (error) {

      console.error(
        "ADMIN STUDENTS ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Could not load students.",

        error:
          error.message
      });
    }
  }
);


/* =========================
   ADMIN UPDATE STUDENT
   SAVE FIX
========================= */

async function updateStudent(
  req,
  res
) {

  try {

    console.log(
      "UPDATE REQUEST ID:",
      req.params.id
    );

    console.log(
      "UPDATE REQUEST BODY:",
      req.body
    );

    const student =
      await getStudent(
        req.params.id
      );

    if (!student) {

      return res.status(404).json({

        success: false,

        message:
          "Student not found."
      });
    }

    const update = {};


    /* NAME */

    if (
      req.body.fullName !==
      undefined
    ) {

      update.full_name =
        String(
          req.body.fullName
        ).trim();
    }


    /* ADDRESS */

    if (
      req.body.address !==
      undefined
    ) {

      update.address =
        String(
          req.body.address
        ).trim();
    }


    /* MOBILE */

    if (
      req.body.mobile !==
      undefined
    ) {

      update.mobile =
        String(
          req.body.mobile
        ).trim();
    }


    /* SEAT */

    if (
      req.body.seatNumber !==
      undefined
    ) {

      update.seat_number =
        String(
          req.body.seatNumber
        ).trim();
    }


    /* DATE */

    if (
      req.body.registrationDate !==
      undefined
    ) {

      update.admission_date =
        String(
          req.body.registrationDate
        );
    }


    console.log(
      "FINAL SUPABASE UPDATE:",
      update
    );


    const updated =
      await patchStudent(
        student,
        update
      );


    console.log(
      "UPDATE SUCCESS:",
      updated
    );


    return res.json({

      success: true,

      message:
        "Student details updated.",

      student:
        publicStudent(
          updated?.[0] ||
          {
            ...student,
            ...update
          }
        )
    });


  } catch (error) {

    console.error(
      "STUDENT UPDATE ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Student update failed.",

      error:
        error.message
    });
  }
}


/* =========================
   UPDATE ROUTES
========================= */

app.put(
  "/api/admin/student/:id",
  adminAuth,
  updateStudent
);

app.patch(
  "/api/admin/students/:id",
  adminAuth,
  updateStudent
);


/* =========================
   UPDATE FEE
========================= */

async function updateFeeForStudent(
  req,
  res
) {

  try {

    const student =
      await getStudent(
        req.params.id
      );

    if (!student) {

      return res.status(404).json({

        success: false,

        message:
          "Student not found."
      });
    }

    const year =
      String(
        req.params.year ||
        req.body.year ||
        indiaYear()
      );

    const month =
      String(
        req.params.month ||
        req.body.month ||
        ""
      );

    if (
      !months.includes(month)
    ) {

      return res.status(400).json({

        success: false,

        message:
          "Invalid month."
      });
    }

    const migrated =
      migrateYearData(student);

    const monthlyFees =
      migrated.monthlyFees;

    const feesByYear =
      migrated.feesByYear;

    if (!feesByYear[year]) {
      feesByYear[year] = {};
    }

    const oldFee =
      feesByYear[year][month] ||
      monthlyFees[month] ||
      emptyFee();

    const fee = {

      ...emptyFee(),

      ...oldFee
    };


    if (
      req.body.status !==
      undefined
    ) {

      fee.status =
        String(
          req.body.status
        ).toUpperCase();
    }


    if (
      req.body.amount !==
      undefined
    ) {

      fee.amount =
        Number(
          req.body.amount
        );
    }


    if (
      req.body.paymentDate !==
      undefined
    ) {

      fee.paymentDate =
        String(
          req.body.paymentDate
        );
    }


    if (
      req.body.paymentMode !==
      undefined
    ) {

      fee.paymentMode =
        String(
          req.body.paymentMode
        );
    }


    if (
      req.body.receiptNumber !==
      undefined
    ) {

      fee.receiptNumber =
        String(
          req.body.receiptNumber
        );
    }


    if (
      fee.status === "PAID"
    ) {

      fee.amount =
        Number(
          fee.amount || 700
        );

      fee.paidDate =
        fee.paidDate ||
        fee.paymentDate ||
        indiaDate();

      fee.paymentDate =
        fee.paymentDate ||
        fee.paidDate;

      fee.paymentMode =
        fee.paymentMode ||
        "Cash";

      fee.receiptNumber =
        fee.receiptNumber ||
        generateReceiptNumber();

      fee.receiptUrl =
        `/api/receipt/${encodeURIComponent(
          student.enrollment_number
        )}/${encodeURIComponent(
          year
        )}/${encodeURIComponent(
          month
        )}`;

    } else {

      fee.status = "DUE";

      fee.paidDate = "";

      fee.paymentDate = "";

      fee.paymentMode = "";

      fee.receiptNumber = "";

      fee.receiptUrl = "";
    }


    feesByYear[year][month] =
      fee;


    if (year === "2026") {

      monthlyFees[month] =
        clone(fee);
    }


    const updated =
      await patchStudent(
        student,
        {

          monthly_fees:
            monthlyFees,

          fees_by_year:
            feesByYear
        }
      );


    return res.json({

      success: true,

      message:
        "Fee updated successfully.",

      year,

      month,

      fee,

      student:
        publicStudent(
          updated?.[0] ||
          {
            ...student,

            monthly_fees:
              monthlyFees,

            fees_by_year:
              feesByYear
          }
        )
    });


  } catch (error) {

    console.error(
      "FEE ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Fee update failed.",

      error:
        error.message
    });
  }
}


app.put(
  "/api/admin/student/:id/fee/:year/:month",
  adminAuth,
  updateFeeForStudent
);

app.patch(
  "/api/admin/students/:id/fee",
  adminAuth,
  updateFeeForStudent
);


/* =========================
   STUDENT FEES
========================= */

app.get(
  "/api/student/:id/fees/:year",
  async (req, res) => {

    try {

      const student =
        await getStudent(
          req.params.id
        );

      if (!student) {

        return res.status(404).json({

          success: false,

          message:
            "Student not found."
        });
      }

      const {
        feesByYear
      } =
        migrateYearData(
          student
        );

      return res.json({

        success: true,

        year:
          req.params.year,

        fees:
          feesByYear[
            req.params.year
          ] || {}
      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        message:
          "Could not load fees."
      });
    }
  }
);


app.get(
  "/api/admin/student/:id/fees/:year",
  adminAuth,
  async (req, res) => {

    try {

      const student =
        await getStudent(
          req.params.id
        );

      if (!student) {

        return res.status(404).json({

          success: false,

          message:
            "Student not found."
        });
      }

      const {
        feesByYear
      } =
        migrateYearData(
          student
        );

      return res.json({

        success: true,

        year:
          req.params.year,

        fees:
          feesByYear[
            req.params.year
          ] || {}
      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        message:
          "Could not load fees."
      });
    }
  }
);
/* =========================
   RECEIPT HELPERS
========================= */

async function getFeeForReceipt(
  student,
  year,
  month
) {

  const {
    feesByYear,
    monthlyFees
  } = migrateYearData(student);

  const fee =
    feesByYear?.[String(year)]?.[month] ||
    (
      String(year) === "2026"
        ? monthlyFees?.[month]
        : null
    );

  return fee;
}

/* =========================
   DOWNLOAD PDF RECEIPT
========================= */

app.get(
  "/api/receipt/:id/:year/:month",
  async (req, res) => {

    try {

      const student = await getStudent(
        req.params.id
      );

      if (!student) {
        return res.status(404).send(
          "Student not found."
        );
      }

      const year = String(req.params.year);
      const month = String(req.params.month);

      if (!months.includes(month)) {
        return res.status(400).send(
          "Invalid month."
        );
      }

      const fee = await getFeeForReceipt(
        student,
        year,
        month
      );

      if (!fee) {
        return res.status(404).send(
          "Fee record not found."
        );
      }

      if (
        String(fee.status).toUpperCase() !==
        "PAID"
      ) {
        return res.status(400).send(
          "This fee is not marked as PAID."
        );
      }

      const filename =
        `Aradhya-Library-${student.enrollment_number}-${year}-${month}-Receipt.pdf`;

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      const doc = new PDFDocument({
        size: "A4",
        margin: 50
      });

      doc.pipe(res);

      doc.fontSize(24)
        .fillColor("#173f75")
        .text(
          "Aradhya Library",
          { align: "center" }
        );

      doc.moveDown(0.3);

      doc.fontSize(16)
        .fillColor("#222")
        .text(
          "Library Fee Receipt",
          { align: "center" }
        );

      doc.moveDown();

      doc.moveTo(50, 125)
        .lineTo(545, 125)
        .strokeColor("#173f75")
        .stroke();

      doc.moveDown(2);

      const rows = [
        [
          "Receipt Number",
          fee.receiptNumber || "-"
        ],
        [
          "Student Name",
          student.full_name || "-"
        ],
        [
          "Enrollment Number",
          student.enrollment_number || "-"
        ],
        [
          "Seat Number",
          student.seat_number || "-"
        ],
        [
          "Fee Month",
          month
        ],
        [
          "Fee Year",
          year
        ],
        [
          "Amount",
          `Rs. ${Number(fee.amount || 700)}`
        ],
        [
          "Payment Date",
          fee.paymentDate ||
          fee.paidDate ||
          "-"
        ],
        [
          "Payment Mode",
          fee.paymentMode || "-"
        ],
        [
          "Status",
          "PAID"
        ]
      ];

      rows.forEach(([label, value]) => {

        doc.font("Helvetica")
          .fontSize(11)
          .fillColor("#333")
          .text(
            `${label}:`,
            70,
            undefined,
            { continued: true }
          );

        doc.font("Helvetica-Bold")
          .text(`  ${value}`);

        doc.font("Helvetica");

        doc.moveDown(0.65);
      });

      doc.moveDown(2);

      doc.fontSize(11)
        .fillColor("#666")
        .text(
          "Thank you for paying the library fee.",
          { align: "center" }
        );

      doc.moveDown();

      doc.text(
        "Aradhya Library Management System",
        { align: "center" }
      );

      doc.end();

    } catch (error) {

      console.error(
        "RECEIPT ERROR:",
        error
      );

      if (!res.headersSent) {
        res.status(500).send(
          "Receipt generation failed."
        );
      } else if (!res.writableEnded) {
        res.end();
      }
    }
  }
);

/* =========================
   OLD RECEIPT URL SUPPORT
========================= */

app.get(
  "/api/receipt/:id/:month",
  (req, res) => {

    return res.redirect(
      302,
      `/api/receipt/${encodeURIComponent(
        req.params.id
      )}/2026/${encodeURIComponent(
        req.params.month
      )}`
    );
  }
);
/* =========================
   ATTENDANCE
========================= */

async function attendanceAction(
  req,
  res,
  mode
) {

  try {

    const {
      enrollmentNumber,
      latitude,
      longitude
    } = req.body || {};

    if (!enrollmentNumber) {

      return res.status(400).json({
        success: false,
        message:
          "Enrollment Number is required."
      });
    }

    const student =
      await getStudent(
        enrollmentNumber
      );

    if (!student) {

      return res.status(404).json({
        success: false,
        message:
          "Student not found."
      });
    }

    const attendance =
      normalizeObject(
        student.attendance_data
      );

    const date =
      indiaDate();

    const year =
      date.slice(0, 4);

    const time =
      indiaTime();

    const month =
      Number(
        date.slice(5, 7)
      );

    if (!attendance[year]) {
      attendance[year] = {};
    }

    if (!attendance[year][date]) {

      attendance[year][date] = {

        date,
        year,
        month,

        inTime: "",
        outTime: "",

        inLatitude: "",
        inLongitude: "",

        outLatitude: "",
        outLongitude: ""
      };
    }

    const record =
      attendance[year][date];


    /* =====================
       MARK IN
    ===================== */

    if (mode === "in") {

      if (record.inTime) {

        return res.status(400).json({

          success: false,

          message:
            "Today's IN attendance is already marked.",

          attendance:
            record
        });
      }

      record.inTime =
        time;

      record.inLatitude =
        latitude ?? "";

      record.inLongitude =
        longitude ?? "";

    }


    /* =====================
       MARK OUT
    ===================== */

    else {

      if (!record.inTime) {

        return res.status(400).json({

          success: false,

          message:
            "Mark IN attendance first."
        });
      }

      if (record.outTime) {

        return res.status(400).json({

          success: false,

          message:
            "Today's OUT attendance is already marked.",

          attendance:
            record
        });
      }

      record.outTime =
        time;

      record.outLatitude =
        latitude ?? "";

      record.outLongitude =
        longitude ?? "";
    }


    await patchStudent(
      student,
      {
        attendance_data:
          attendance
      }
    );


    return res.json({

      success: true,

      message:
        `Attendance ${mode.toUpperCase()} marked successfully.`,

      attendance:
        record
    });


  } catch (error) {

    console.error(
      "ATTENDANCE ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Attendance failed.",

      error:
        error.message
    });
  }
}


/* =========================
   STUDENT ATTENDANCE IN
========================= */

app.post(
  "/api/student/attendance/in",
  (req, res) =>
    attendanceAction(
      req,
      res,
      "in"
    )
);


/* =========================
   STUDENT ATTENDANCE OUT
========================= */

app.post(
  "/api/student/attendance/out",
  (req, res) =>
    attendanceAction(
      req,
      res,
      "out"
    )
);


/* =========================
   STUDENT ATTENDANCE DATA
========================= */

app.get(
  "/api/student/:id/attendance/:year",
  async (req, res) => {

    try {

      const student =
        await getStudent(
          req.params.id
        );

      if (!student) {

        return res.status(404).json({

          success: false,

          message:
            "Student not found."
        });
      }

      const attendance =
        normalizeObject(
          student.attendance_data
        );

      return res.json({

        success: true,

        year:
          req.params.year,

        attendance:
          attendance[
            req.params.year
          ] || {}
      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        message:
          "Could not load attendance."
      });
    }
  }
);


/* =========================
   ADMIN ATTENDANCE
========================= */

app.get(
  "/api/admin/student/:id/attendance/:year",
  adminAuth,
  async (req, res) => {

    try {

      const student =
        await getStudent(
          req.params.id
        );

      if (!student) {

        return res.status(404).json({

          success: false,

          message:
            "Student not found."
        });
      }

      const attendance =
        normalizeObject(
          student.attendance_data
        );

      return res.json({

        success: true,

        year:
          req.params.year,

        attendance:
          attendance[
            req.params.year
          ] || {}
      });

    } catch (error) {

      return res.status(500).json({

        success: false,

        message:
          "Could not load attendance."
      });
    }
  }
);


/* =========================
   ADMIN EDIT ATTENDANCE
========================= */

app.patch(
  "/api/admin/students/:id/attendance",
  adminAuth,
  async (req, res) => {

    try {

      const student =
        await getStudent(
          req.params.id
        );

      if (!student) {

        return res.status(404).json({

          success: false,

          message:
            "Student not found."
        });
      }

      const year =
        String(
          req.body.year ||
          indiaYear()
        );

      const date =
        String(
          req.body.date || ""
        );

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(
          date
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Valid attendance date is required."
        });
      }

      if (
        !date.startsWith(
          `${year}-`
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Date does not belong to selected year."
        });
      }

      const attendance =
        normalizeObject(
          student.attendance_data
        );

      if (!attendance[year]) {
        attendance[year] = {};
      }

      const old =
        attendance[year][date] || {

          date,

          year,

          month:
            Number(
              date.slice(5, 7)
            ),

          inTime: "",
          outTime: "",

          inLatitude: "",
          inLongitude: "",

          outLatitude: "",
          outLongitude: ""
        };


      if (
        req.body.inTime !==
        undefined
      ) {

        old.inTime =
          String(
            req.body.inTime || ""
          ).trim();
      }


      if (
        req.body.outTime !==
        undefined
      ) {

        old.outTime =
          String(
            req.body.outTime || ""
          ).trim();
      }


      old.date =
        date;

      old.year =
        year;

      old.month =
        Number(
          date.slice(5, 7)
        );


      attendance[year][date] =
        old;


      await patchStudent(
        student,
        {
          attendance_data:
            attendance
        }
      );


      return res.json({

        success: true,

        message:
          "Attendance updated successfully.",

        attendance:
          old
      });


    } catch (error) {

      console.error(
        "ADMIN ATTENDANCE UPDATE ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          "Attendance update failed.",

        error:
          error.message
      });
    }
  }
);
/* =========================
   FRONTEND
========================= */

app.use(
  express.static(ROOT)
);


/* =========================
   API 404
========================= */

app.use(
  (req, res) => {

    if (
      req.path.startsWith("/api/")
    ) {

      return res.status(404).json({

        success: false,

        message:
          "API route not found."
      });
    }


    /* =====================
       FRONTEND FALLBACK
    ===================== */

    res.sendFile(
      path.join(
        ROOT,
        "index.html"
      )
    );
  }
);


/* =========================
   START SERVER
========================= */

app.listen(
  PORT,
  () => {

    console.log(
      `Aradhya Library server running on port ${PORT}`
    );

    console.log(
      "Database: Supabase"
    );

  }
);
