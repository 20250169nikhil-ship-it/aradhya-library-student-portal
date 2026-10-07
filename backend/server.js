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

const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || "AL741774";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "Aradhya@123";

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
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

function indiaMonthNumber() {
  return Number(
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        month: "2-digit"
      }
    ).format(indiaNow())
  );
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

function normalizeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

/*
  IMPORTANT:
  Fee amount is NOT decided by month.
  Admin will manually enter ₹500, ₹700,
  or any valid amount.
*/
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

function generateEnrollmentNumber(students) {
  let highest = 0;

  for (const student of students) {
    const match = String(
      student.enrollment_number || ""
    ).match(/^AR2026(\d{4})$/);

    if (match) {
      highest = Math.max(
        highest,
        Number(match[1])
      );
    }
  }

  return `AR2026${String(
    highest + 1
  ).padStart(4, "0")}`;
}

function generateReceiptNumber() {
  const stamp =
    Date.now().toString().slice(-7);

  return `AL-FEE-${indiaYear()}-${stamp}`;
}

function findStudentQuery(id) {
  const value =
    String(id || "").trim();

  if (
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(
      value
    )
  ) {
    return (
      `?id=eq.${encodeURIComponent(value)}` +
      `&limit=1`
    );
  }

  return (
    `?enrollment_number=eq.` +
    `${encodeURIComponent(value)}&limit=1`
  );
}

async function getStudent(id) {
  const rows =
    await supabaseRequest(
      "students",
      {
        query: findStudentQuery(id)
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
    typeof feesByYear["2026"] !== "object"
  ) {
    feesByYear["2026"] =
      clone(monthlyFees);
  }

  if (
    !feesByYear[currentYear] ||
    typeof feesByYear[currentYear] !== "object"
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

function publicStudent(student) {
  const migrated =
    migrateYearData(student);

  const currentYear =
    String(indiaYear());

  const currentFees =
    migrated.feesByYear[currentYear] ||
    migrated.monthlyFees;

  return {
    id: student.enrollment_number,
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

function adminAuth(req, res, next) {
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
      token !== "ARADHYA_ADMIN_ACCESS"
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

async function patchStudent(
  student,
  body
) {
  return await supabaseRequest(
    "students",
    {
      method: "PATCH",

      query:
        `?id=eq.${encodeURIComponent(
          student.id
        )}`,

      body: {
        ...body,
        updated_at:
          new Date().toISOString()
      }
    }
  );
}

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      success: true,
      message:
        "Aradhya Library API is running.",
      database: "Supabase"
    });
  }
);

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
          `ADMIN-${Date.now()}`,

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
              `?mobile=eq.${encodeURIComponent(
                String(mobile)
              )}&limit=1`
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
            body: newStudent
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
      console.error(
        "STUDENT LOAD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load student."
      });
    }
  }
);


/* =========================
   ADMIN - ALL STUDENTS
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
   UPDATE STUDENT
========================= */

async function updateStudent(
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


    /* ADMISSION DATE */

    if (
      req.body.registrationDate !==
      undefined
    ) {
      update.admission_date =
        String(
          req.body.registrationDate
        ).trim();
    }


    if (
      !Object.keys(update).length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "No student details supplied."
      });
    }


    const updated =
      await patchStudent(
        student,
        update
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
   ADMIN MANUALLY SETS AMOUNT
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
      migrateYearData(
        student
      );


    const monthlyFees =
      migrated.monthlyFees;

    const feesByYear =
      migrated.feesByYear;


    if (
      !feesByYear[year]
    ) {
      feesByYear[year] = {};
    }


    /*
      IMPORTANT:

      Existing saved amount is preserved.

      Admin can manually change it
      by sending "amount".

      No summer/winter automatic
      amount calculation is used.
    */

    const oldFee =
      feesByYear[year][month] ||
      (
        year === "2026"
          ? monthlyFees[month]
          : null
      ) ||
      emptyFee();


    const fee = {
      ...emptyFee(),
      ...oldFee
    };


    /* =====================
       AMOUNT
    ===================== */

    if (
      req.body.amount !==
      undefined
    ) {

      const amount =
        Number(
          req.body.amount
        );


      if (
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid fee amount."
        });
      }


      fee.amount =
        Math.round(amount);
    }


    /* =====================
       STATUS
    ===================== */

    if (
      req.body.status !==
      undefined
    ) {

      const status =
        String(
          req.body.status
        )
          .trim()
          .toUpperCase();


      if (
        status !== "PAID" &&
        status !== "DUE"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid fee status."
        });
      }


      fee.status =
        status;
    }


    /* =====================
       PAYMENT DATE
    ===================== */

    if (
      req.body.paymentDate !==
      undefined
    ) {
      fee.paymentDate =
        String(
          req.body.paymentDate
        ).trim();
    }


    /* =====================
       PAYMENT MODE
    ===================== */

    if (
      req.body.paymentMode !==
      undefined
    ) {
      fee.paymentMode =
        String(
          req.body.paymentMode
        ).trim();
    }


    /* =====================
       RECEIPT NUMBER
    ===================== */

    if (
      req.body.receiptNumber !==
      undefined
    ) {
      fee.receiptNumber =
        String(
          req.body.receiptNumber
        ).trim();
    }


    /* =====================
       ADMISSION STATUS
    ===================== */

    if (
      req.body.admissionStatus !==
      undefined
    ) {

      const admissionStatus =
        String(
          req.body.admissionStatus
        )
          .trim()
          .toUpperCase();


      if (
        admissionStatus !== "OPEN" &&
        admissionStatus !== "CLOSED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid admission status."
        });
      }


      fee.admissionStatus =
        admissionStatus;
    }


    /* =====================
       PAID LOGIC
    ===================== */

    if (
      fee.status === "PAID"
    ) {

      if (
        !Number.isFinite(
          Number(fee.amount)
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Valid fee amount is required."
        });
      }


      fee.amount =
        Math.round(
          Number(fee.amount)
        );


      fee.paymentDate =
        fee.paymentDate ||
        fee.paidDate ||
        indiaDate();


      fee.paidDate =
        fee.paidDate ||
        fee.paymentDate;


      fee.paymentMode =
        fee.paymentMode ||
        "Cash";


      fee.receiptNumber =
        fee.receiptNumber ||
        generateReceiptNumber();


      /*
        STUDENT RECEIPT DOWNLOAD URL

        Student dashboard can use this
        URL to download the PDF.
      */

      fee.receiptUrl =
        `/api/receipt/` +
        `${encodeURIComponent(
          student.enrollment_number
        )}/` +
        `${encodeURIComponent(
          year
        )}/` +
        `${encodeURIComponent(
          month
        )}`;

    } else {

      fee.status =
        "DUE";

      fee.paidDate =
        "";

      fee.paymentDate =
        "";

      fee.paymentMode =
        "";

      fee.receiptNumber =
        "";

      fee.receiptUrl =
        "";
    }


    /* =====================
       SAVE FEE
    ===================== */

    feesByYear[year][month] =
      clone(fee);


    /*
      Keep 2026 legacy field
      synchronized.
    */

    if (
      year === "2026"
    ) {
      monthlyFees[month] =
        clone(fee);
    }


    /*
      SAVE TO SUPABASE
    */

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


    console.log(
      "FEE SAVED:",
      student.enrollment_number,
      year,
      month,
      fee.amount,
      fee.status
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


/* =========================
   FEE ROUTES
========================= */

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

      console.error(
        "STUDENT FEE ERROR:",
        error
      );

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

      console.error(
        "ADMIN FEE LOAD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load fees."
      });
    }
  }
);
/* =========================
   PDF RECEIPT
========================= */

async function getFeeForReceipt(
  student,
  year,
  month
) {
  const {
    feesByYear,
    monthlyFees
  } = migrateYearData(
    student
  );

  const fee =
    feesByYear?.[
      String(year)
    ]?.[month] ||
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

      const student =
        await getStudent(
          req.params.id
        );


      if (!student) {
        return res
          .status(404)
          .send(
            "Student not found."
          );
      }


      const year =
        String(
          req.params.year
        );


      const month =
        String(
          req.params.month
        );


      if (
        !months.includes(month)
      ) {
        return res
          .status(400)
          .send(
            "Invalid month."
          );
      }


      const fee =
        await getFeeForReceipt(
          student,
          year,
          month
        );


      if (!fee) {
        return res
          .status(404)
          .send(
            "Fee record not found."
          );
      }


      if (
        String(
          fee.status
        ).toUpperCase() !==
        "PAID"
      ) {
        return res
          .status(400)
          .send(
            "This fee is not marked as PAID."
          );
      }


      /* =====================
         PDF FILE NAME
      ===================== */

      const filename =
        `Aradhya-Library-` +
        `${student.enrollment_number}-` +
        `${year}-` +
        `${month}-Receipt.pdf`;


      res.setHeader(
        "Content-Type",
        "application/pdf"
      );


      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );


      /* =====================
         CREATE PDF
      ===================== */

      const doc =
        new PDFDocument({
          size: "A4",
          margin: 50
        });


      doc.pipe(res);


      /* =====================
         HEADER
      ===================== */

      doc
        .fontSize(24)
        .fillColor("#173f75")
        .text(
          "Aradhya Library",
          {
            align: "center"
          }
        );


      doc.moveDown(0.3);


      doc
        .fontSize(16)
        .fillColor("#222")
        .text(
          "Library Fee Receipt",
          {
            align: "center"
          }
        );


      doc.moveDown();


      doc
        .moveTo(50, 125)
        .lineTo(545, 125)
        .strokeColor("#173f75")
        .stroke();


      doc.moveDown(2);


      /* =====================
         RECEIPT DETAILS
      ===================== */

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
          `Rs. ${Number(
            fee.amount || 700
          )}`
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


      /* =====================
         PRINT DETAILS
      ===================== */

      rows.forEach(
        ([label, value]) => {

          doc
            .font("Helvetica")
            .fontSize(11)
            .fillColor("#333")
            .text(
              `${label}:`,
              70,
              undefined,
              {
                continued: true
              }
            );


          doc
            .font("Helvetica-Bold")
            .text(
              `  ${value}`
            );


          doc.font(
            "Helvetica"
          );


          doc.moveDown(
            0.65
          );
        }
      );


      /* =====================
         FOOTER
      ===================== */

      doc.moveDown(2);


      doc
        .fontSize(11)
        .fillColor("#666")
        .text(
          "Thank you for paying the library fee.",
          {
            align: "center"
          }
        );


      doc.moveDown();


      doc.text(
        "Aradhya Library Management System",
        {
          align: "center"
        }
      );


      /* =====================
         FINISH PDF
      ===================== */

      doc.end();

    } catch (error) {

      console.error(
        "RECEIPT ERROR:",
        error
      );


      if (
        !res.headersSent
      ) {
        res
          .status(500)
          .send(
            "Receipt generation failed."
          );
      }
    }
  }
);


/* =========================
   OLD 2026 RECEIPT URL
   BACKWARD COMPATIBILITY
========================= */

app.get(
  "/api/receipt/:id/:month",
  (req, res) => {

    return res.redirect(
      302,
      `/api/receipt/` +
      `${encodeURIComponent(
        req.params.id
      )}/2026/` +
      `${encodeURIComponent(
        req.params.month
      )}`
    );
  }
);


/* =========================
   ATTENDANCE - STUDENT
========================= */

app.get(
  "/api/student/:id/attendance",
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
        student.attendance_data ||
        {};


      return res.json({
        success: true,
        attendance
      });

    } catch (error) {

      console.error(
        "ATTENDANCE LOAD ERROR:",
        error
      );

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
  "/api/admin/student/:id/attendance",
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
        attendance:
          student.attendance_data || {}
      });

    } catch (error) {

      console.error(
        "ADMIN ATTENDANCE LOAD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not load attendance."
      });
    }
  }
);


/* =========================
   UPDATE STUDENT ATTENDANCE
========================= */

app.put(
  "/api/admin/student/:id/attendance",
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
        req.body.attendance;


      if (
        !attendance ||
        typeof attendance !== "object"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid attendance data."
        });
      }


      await patchStudent(
        student.id,
        {
          attendance_data:
            attendance,
          updated_at:
            new Date().toISOString()
        }
      );


      return res.json({
        success: true,
        message:
          "Attendance updated successfully.",
        attendance
      });

    } catch (error) {

      console.error(
        "ATTENDANCE UPDATE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not update attendance."
      });
    }
  }
);


/* =========================
   MARK ATTENDANCE
========================= */

app.post(
  "/api/admin/student/:id/attendance/mark",
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


      const date =
        String(
          req.body.date || ""
        ).trim();


      const status =
        String(
          req.body.status || ""
        )
          .trim()
          .toUpperCase();


      if (!date) {
        return res.status(400).json({
          success: false,
          message:
            "Date is required."
        });
      }


      if (
        !["PRESENT", "ABSENT", "LEAVE"]
          .includes(status)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid attendance status."
        });
      }


      const attendance = {
        ...(student.attendance_data || {})
      };


      attendance[date] = {
        status,
        updatedAt:
          new Date().toISOString()
      };


      await patchStudent(
        student.id,
        {
          attendance_data:
            attendance,
          updated_at:
            new Date().toISOString()
        }
      );


      return res.json({
        success: true,
        message:
          "Attendance marked successfully.",
        attendance
      });

    } catch (error) {

      console.error(
        "MARK ATTENDANCE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not mark attendance."
      });
    }
  }
);


/* =========================
   DELETE ATTENDANCE ENTRY
========================= */

app.delete(
  "/api/admin/student/:id/attendance/:date",
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


      const date =
        String(
          req.params.date
        ).trim();


      const attendance = {
        ...(student.attendance_data || {})
      };


      delete attendance[date];


      await patchStudent(
        student.id,
        {
          attendance_data:
            attendance,
          updated_at:
            new Date().toISOString()
        }
      );


      return res.json({
        success: true,
        message:
          "Attendance entry deleted.",
        attendance
      });

    } catch (error) {

      console.error(
        "DELETE ATTENDANCE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not delete attendance."
      });
    }
  }
);


/* =========================
   ATTENDANCE SUMMARY
========================= */

app.get(
  "/api/admin/student/:id/attendance/summary",
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
        student.attendance_data ||
        {};


      let present = 0;
      let absent = 0;
      let leave = 0;


      Object.values(
        attendance
      ).forEach(item => {

        const status =
          String(
            item?.status || ""
          ).toUpperCase();


        if (
          status === "PRESENT"
        ) {
          present++;
        }

        else if (
          status === "ABSENT"
        ) {
          absent++;
        }

        else if (
          status === "LEAVE"
        ) {
          leave++;
        }

      });


      const total =
        present +
        absent +
        leave;


      const percentage =
        total > 0
          ? Number(
              (
                (present / total) *
                100
              ).toFixed(2)
            )
          : 0;


      return res.json({
        success: true,
        summary: {
          present,
          absent,
          leave,
          total,
          percentage
        }
      });

    } catch (error) {

      console.error(
        "ATTENDANCE SUMMARY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not calculate attendance."
      });
    }
  }
);


/* =========================
   ADMIN STUDENT ATTENDANCE
   BULK UPDATE
========================= */

app.put(
  "/api/admin/students/:id/attendance",
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
        req.body.attendance;


      if (
        !attendance ||
        typeof attendance !== "object"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid attendance data."
        });
      }


      await patchStudent(
        student.id,
        {
          attendance_data:
            attendance,
          updated_at:
            new Date().toISOString()
        }
      );


      return res.json({
        success: true,
        message:
          "Attendance saved successfully.",
        attendance
      });

    } catch (error) {

      console.error(
        "BULK ATTENDANCE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Could not save attendance."
      });
    }
  }
);
/* =========================
   STATIC FRONTEND
========================= */

const frontendPath =
  path.join(__dirname, "..", "frontend");

app.use(
  express.static(frontendPath)
);


/* =========================
   ROBOTS.TXT
========================= */

app.get(
  "/robots.txt",
  (req, res) => {

    res.type("text/plain");

    res.send(
      "User-agent: *\n" +
      "Disallow: /\n"
    );
  }
);


/* =========================
   NO-INDEX HEADERS
========================= */

app.use(
  (req, res, next) => {

    res.setHeader(
      "X-Robots-Tag",
      "noindex, nofollow, noarchive"
    );

    next();
  }
);


/* =========================
   FRONTEND FALLBACK
========================= */

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        frontendPath,
        "index.html"
      )
    );
  }
);


/* =========================
   SERVER START
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Aradhya Library server running on port ${PORT}`
    );

    console.log(
      "Database: Supabase"
    );

    console.log(
      "Receipt PDF: ENABLED"
    );

    console.log(
      "Manual fee amount: ENABLED"
    );

  }
);
