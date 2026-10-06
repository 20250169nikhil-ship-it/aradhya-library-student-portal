const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "AL741774";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Aradhya@123";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]", "utf8");
}

function getUsers() {
  try {
    const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(
    USERS_FILE,
    JSON.stringify(users, null, 2),
    "utf8"
  );
}

function createMonthlyFees() {
  const fees = {};

  months.forEach(month => {
    fees[month] = {
      amount: 700,
      status: "DUE",
      paidDate: "",
      paymentDate: "",
      paymentMode: "",
      receiptNumber: "",
      receiptUrl: "",
      admissionStatus: "OPEN"
    };
  });

  return fees;
}

function ensureUserStructure(user) {
  if (!user.monthlyFees) {
    user.monthlyFees = createMonthlyFees();
  }

  months.forEach(month => {
    if (!user.monthlyFees[month]) {
      user.monthlyFees[month] = {
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
  });

  if (!user.feesByYear) {
    user.feesByYear = {};
  }

  if (!user.attendance) {
    user.attendance = {};
  }
}

function generateEnrollmentNumber() {
  const users = getUsers();
  let highest = 0;

  users.forEach(user => {
    const m = String(user.enrollmentNumber || "")
      .match(/^AR2026(\d{4})$/);

    if (m) {
      highest = Math.max(highest, Number(m[1]));
    }
  });

  return "AR2026" + String(highest + 1).padStart(4, "0");
}

function generateReceiptNumber() {
  return (
    "AL-FEE-" +
    new Date().getFullYear() +
    "-" +
    Math.floor(1000 + Math.random() * 9000)
  );
}

function adminAuth(req, res, next) {
  const token = String(
    req.headers.authorization || ""
  )
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token || !token.startsWith("ADMIN-")) {
    return res.status(401).json({
      success: false,
      message: "Admin login required."
    });
  }

  next();
}

function publicStudent(user) {
  ensureUserStructure(user);

  return {
    id: user.id,
    enrollmentNumber: user.enrollmentNumber,
    fullName: user.fullName,
    address: user.address,
    mobile: user.mobile,
    registrationDate: user.registrationDate || "",
    seatNumber: user.seatNumber || "",
    monthlyFees: user.monthlyFees || {},
    feesByYear: user.feesByYear || {},
    attendance: user.attendance || {},
    createdAt: user.createdAt || ""
  };
}

function dateParts() {
  const now = new Date();

  const date = now.toISOString().slice(0, 10);

  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  return {
    now,
    date,
    time,
    year: String(now.getFullYear())
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Aradhya Library API is running."
  });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};

  if (
    username === ADMIN_USERNAME &&
    password === ADMIN_PASSWORD
  ) {
    return res.json({
      success: true,
      username: ADMIN_USERNAME,
      token: "ADMIN-" + Date.now(),
      message: "Admin Login Successful!"
    });
  }

  res.status(401).json({
    success: false,
    message: "Invalid Admin Username or Password."
  });
});


/* =========================================================
   DIRECT STUDENT REGISTRATION
   OTP / FIREBASE REMOVED
   ========================================================= */

app.post("/api/register", async (req, res) => {
  const {
    fullName,
    address,
    mobile,
    password
  } = req.body || {};

  if (!fullName || !address || !mobile || !password) {
    return res.status(400).json({
      success: false,
      message: "Please fill all required fields."
    });
  }

  if (!/^[6-9]\d{9}$/.test(String(mobile))) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid 10-digit Indian mobile number."
    });
  }

  if (String(password).length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters."
    });
  }

  const users = getUsers();

  const exists = users.some(
    u => String(u.mobile) === String(mobile)
  );

  if (exists) {
    return res.status(409).json({
      success: false,
      message: "Mobile number already registered."
    });
  }

  const enrollmentNumber = generateEnrollmentNumber();

  const newUser = {
    id: Date.now(),

    enrollmentNumber,

    fullName: String(fullName).trim(),

    address: String(address).trim(),

    mobile: String(mobile),

    password: await bcrypt.hash(
      String(password),
      10
    ),

    registrationDate:
      new Date().toISOString().slice(0, 10),

    seatNumber: "",

    monthlyFees: createMonthlyFees(),

    feesByYear: {},

    attendance: {},

    createdAt: new Date().toISOString()
  };

  users.push(newUser);

  saveUsers(users);

  res.status(201).json({
    success: true,
    message: "Registration successful!",
    enrollmentNumber: newUser.enrollmentNumber,
    student: publicStudent(newUser)
  });
});


/* =========================================================
   STUDENT LOGIN
   ========================================================= */

app.post("/api/login", async (req, res) => {
  const {
    enrollmentNumber,
    password
  } = req.body || {};

  if (!enrollmentNumber || !password) {
    return res.status(400).json({
      success: false,
      message:
        "Enrollment Number and Password are required."
    });
  }

  const users = getUsers();

  const user = users.find(
    u =>
      String(u.enrollmentNumber).toUpperCase() ===
      String(enrollmentNumber).toUpperCase()
  );

  if (
    !user ||
    !(await bcrypt.compare(
      String(password),
      user.password
    ))
  ) {
    return res.status(401).json({
      success: false,
      message:
        "Invalid Enrollment Number or Password."
    });
  }

  ensureUserStructure(user);

  saveUsers(users);

  res.json({
    success: true,
    message: "Login Successful!",
    student: publicStudent(user)
  });
});


/* =========================================================
   STUDENT DATA
   ========================================================= */

app.get("/api/student/:id", (req, res) => {
  const user = getUsers().find(
    u => String(u.id) === String(req.params.id)
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Student not found."
    });
  }

  res.json({
    success: true,
    student: publicStudent(user)
  });
});


/* =========================================================
   ADMIN - ALL STUDENTS
   ========================================================= */

app.get("/api/admin/students", adminAuth, (req, res) => {
  const users = getUsers();

  users.forEach(ensureUserStructure);

  saveUsers(users);

  res.json({
    success: true,
    students: users.map(publicStudent)
  });
});


/* =========================================================
   ADMIN - UPDATE STUDENT
   ========================================================= */

app.put(
  "/api/admin/student/:id",
  adminAuth,
  (req, res) => {
    const users = getUsers();

    const user = users.find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    [
      "seatNumber",
      "registrationDate",
      "fullName",
      "address",
      "mobile"
    ].forEach(key => {
      if (req.body[key] !== undefined) {
        user[key] = String(req.body[key]).trim();
      }
    });

    ensureUserStructure(user);

    saveUsers(users);

    res.json({
      success: true,
      message: "Student details updated.",
      student: publicStudent(user)
    });
  }
);


/* =========================================================
   COMPATIBILITY UPDATE ROUTE
   ========================================================= */

app.patch(
  "/api/admin/students/:id",
  adminAuth,
  (req, res) => {
    const users = getUsers();

    const user = users.find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    [
      "seatNumber",
      "registrationDate",
      "fullName",
      "address",
      "mobile"
    ].forEach(key => {
      if (req.body[key] !== undefined) {
        user[key] = String(req.body[key]).trim();
      }
    });

    ensureUserStructure(user);

    saveUsers(users);

    res.json({
      success: true,
      message: "Student details updated.",
      student: publicStudent(user)
    });
  }
);


/* =========================================================
   FEE UPDATE FUNCTION
   ========================================================= */

function updateFee(user, year, month, data) {
  ensureUserStructure(user);

  if (!user.feesByYear[year]) {
    user.feesByYear[year] = {};
  }

  if (!user.feesByYear[year][month]) {
    user.feesByYear[year][month] = {
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

  const fee =
    user.feesByYear[year][month];

  Object.keys(data || {}).forEach(key => {
    if (data[key] !== undefined) {
      fee[key] = data[key];
    }
  });

  if (
    String(fee.status).toUpperCase() === "PAID"
  ) {
    fee.paidDate =
      fee.paidDate ||
      new Date().toISOString().slice(0, 10);

    fee.paymentDate =
      fee.paymentDate ||
      fee.paidDate;

    fee.receiptNumber =
      fee.receiptNumber ||
      generateReceiptNumber();
  }

  if (
    year === String(new Date().getFullYear()) &&
    months.includes(month)
  ) {
    user.monthlyFees[month] = {
      ...user.monthlyFees[month],
      ...fee
    };
  }

  return fee;
}


/* =========================================================
   ADMIN - UPDATE FEE
   ========================================================= */

app.put(
  "/api/admin/student/:id/fee/:year/:month",
  adminAuth,
  (req, res) => {
    const users = getUsers();

    const user = users.find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    const fee = updateFee(
      user,
      req.params.year,
      req.params.month,
      req.body
    );

    saveUsers(users);

    res.json({
      success: true,
      message: "Fee updated successfully.",
      fee
    });
  }
);


/* =========================================================
   OLD ADMIN FEE ROUTE
   ========================================================= */

app.patch(
  "/api/admin/students/:id/fee",
  adminAuth,
  (req, res) => {
    const users = getUsers();

    const user = users.find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    const year =
      String(new Date().getFullYear());

    const month =
      String(req.body.month || "");

    if (!months.includes(month)) {
      return res.status(400).json({
        success: false,
        message: "Invalid month."
      });
    }

    const fee = updateFee(
      user,
      year,
      month,
      {
        status: req.body.status,
        paymentMode: req.body.paymentMode,
        paidDate: req.body.paidDate,
        paymentDate: req.body.paymentDate,
        receiptNumber: req.body.receiptNumber,
        receiptUrl: req.body.receiptUrl,
        admissionStatus: req.body.admissionStatus
      }
    );

    saveUsers(users);

    res.json({
      success: true,
      message: "Fee updated successfully.",
      fee
    });
  }
);
/* =========================================================
   STUDENT FEES
   ========================================================= */

app.get(
  "/api/student/:id/fees/:year",
  (req, res) => {
    const user = getUsers().find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    ensureUserStructure(user);

    res.json({
      success: true,
      year: req.params.year,
      fees:
        user.feesByYear?.[req.params.year] || {}
    });
  }
);


/* =========================================================
   ADMIN - STUDENT FEES
   ========================================================= */

app.get(
  "/api/admin/student/:id/fees/:year",
  adminAuth,
  (req, res) => {
    const user = getUsers().find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    ensureUserStructure(user);

    res.json({
      success: true,
      year: req.params.year,
      fees:
        user.feesByYear?.[req.params.year] || {}
    });
  }
);


/* =========================================================
   ATTENDANCE
   ========================================================= */

function attendanceAction(req, res, mode) {
  const {
    enrollmentNumber,
    latitude,
    longitude
  } = req.body || {};

  if (!enrollmentNumber) {
    return res.status(400).json({
      success: false,
      message: "Enrollment Number is required."
    });
  }

  const users = getUsers();

  const user = users.find(
    u =>
      String(u.enrollmentNumber).toUpperCase() ===
      String(enrollmentNumber).toUpperCase()
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Student not found."
    });
  }

  ensureUserStructure(user);

  const {
    date,
    time,
    year,
    now
  } = dateParts();

  if (!user.attendance[year]) {
    user.attendance[year] = {};
  }

  if (!user.attendance[year][date]) {
    user.attendance[year][date] = {
      date,
      year,
      month: now.getMonth() + 1,

      inTime: "",
      outTime: "",

      inLatitude: "",
      inLongitude: "",

      outLatitude: "",
      outLongitude: ""
    };
  }

  const attendance =
    user.attendance[year][date];

  if (mode === "in") {

    if (attendance.inTime) {
      return res.status(400).json({
        success: false,
        message:
          "Today's IN attendance is already marked.",
        attendance
      });
    }

    attendance.inTime = time;
    attendance.inLatitude =
      latitude ?? "";
    attendance.inLongitude =
      longitude ?? "";

  } else {

    if (!attendance.inTime) {
      return res.status(400).json({
        success: false,
        message:
          "Mark IN attendance first."
      });
    }

    if (attendance.outTime) {
      return res.status(400).json({
        success: false,
        message:
          "Today's OUT attendance is already marked.",
        attendance
      });
    }

    attendance.outTime = time;
    attendance.outLatitude =
      latitude ?? "";
    attendance.outLongitude =
      longitude ?? "";
  }

  saveUsers(users);

  res.json({
    success: true,
    message:
      `Attendance ${mode.toUpperCase()} marked successfully.`,
    attendance
  });
}


/* =========================================================
   ATTENDANCE IN / OUT
   ========================================================= */

app.post(
  "/api/student/attendance/in",
  (req, res) =>
    attendanceAction(req, res, "in")
);

app.post(
  "/api/student/attendance/out",
  (req, res) =>
    attendanceAction(req, res, "out")
);


/* =========================================================
   STUDENT ATTENDANCE
   ========================================================= */

app.get(
  "/api/student/:id/attendance/:year",
  (req, res) => {
    const user = getUsers().find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    ensureUserStructure(user);

    res.json({
      success: true,
      year: req.params.year,
      attendance:
        user.attendance?.[req.params.year] || {}
    });
  }
);


/* =========================================================
   ADMIN ATTENDANCE
   ========================================================= */

app.get(
  "/api/admin/student/:id/attendance/:year",
  adminAuth,
  (req, res) => {
    const user = getUsers().find(
      u => String(u.id) === String(req.params.id)
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Student not found."
      });
    }

    ensureUserStructure(user);

    res.json({
      success: true,
      year: req.params.year,
      attendance:
        user.attendance?.[req.params.year] || {}
    });
  }
);


/* =========================================================
   FRONTEND FILES
   ========================================================= */

app.use(express.static(ROOT));


/* =========================================================
   DEFAULT ROUTE
   ========================================================= */

app.use((req, res) => {

  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      message: "API route not found."
    });
  }

  res.sendFile(
    path.join(ROOT, "index.html")
  );
});


/* =========================================================
   START SERVER
   ========================================================= */

app.listen(PORT, () => {

  console.log(
    `\nAradhya Library running: http://localhost:${PORT}`
  );

  console.log(
    `Admin ID: ${ADMIN_USERNAME}`
  );

  console.log(
    `Admin Password: ${ADMIN_PASSWORD}\n`
  );

});
