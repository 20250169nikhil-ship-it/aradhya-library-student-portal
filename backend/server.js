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

/* =====================================================
   SUPABASE
===================================================== */

if (!SUPABASE_KEY) {
    console.error("SUPABASE_SECRET_KEY is missing.");
}

async function supabaseRequest(
    table,
    options = {}
) {
    const {
        method = "GET",
        query = "",
        body
    } = options;

    const url =
        SUPABASE_URL +
        "/rest/v1/" +
        table +
        query;

    const headers = {
        apikey: SUPABASE_KEY,
        Authorization:
            "Bearer " + SUPABASE_KEY,
        "Content-Type":
            "application/json",
        Prefer:
            "return=representation"
    };

    const response = await fetch(
        url,
        {
            method,
            headers,
            body:
                body === undefined
                    ? undefined
                    : JSON.stringify(body)
        }
    );

    const text = await response.text();

    let data;

    try {
        data = text
            ? JSON.parse(text)
            : null;
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

/* =====================================================
   HELPERS
===================================================== */

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

function normalizeFees(value) {
    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    ) {
        const fees = value;

        months.forEach(month => {
            if (!fees[month]) {
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
            }
        });

        return fees;
    }

    return createMonthlyFees();
}

function normalizeObject(value) {
    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    ) {
        return value;
    }

    return {};
}

function generateEnrollmentNumber(students) {
    let highest = 0;

    for (const student of students) {
        const value =
            String(
                student.enrollment_number || ""
            );

        const match =
            value.match(
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

function generateReceiptNumber() {
    return (
        "AL-FEE-" +
        new Date().getFullYear() +
        "-" +
        Math.floor(
            1000 +
            Math.random() * 9000
        )
    );
}

function today() {
    return new Date()
        .toISOString()
        .slice(0, 10);
}

function publicStudent(student) {
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

        monthlyFees,

        feesByYear,

        attendance,

        createdAt:
            student.created_at || ""
    };
}

function findStudentQuery(id) {
    const value =
        String(id || "").trim();

    if (
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i
            .test(value)
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

/* =====================================================
   HEALTH
===================================================== */

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

/* =====================================================
   ADMIN LOGIN
===================================================== */

app.post(
    "/api/admin/login",
    (req, res) => {

        const {
            username,
            password
        } = req.body || {};

        if (
            username ===
                ADMIN_USERNAME &&
            password ===
                ADMIN_PASSWORD
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

/* =====================================================
   REGISTER
===================================================== */

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

                seat_number: "",

                admission_date:
                    today(),

                status:
                    "ACTIVE",

                monthly_fees:
                    createMonthlyFees(),

                fees_by_year: {},

                attendance_data: {}
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
                enrollmentNumber:
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

/* =====================================================
   STUDENT LOGIN
===================================================== */

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

/* =====================================================
   STUDENT DATA
===================================================== */

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

/* =====================================================
   ADMIN - ALL STUDENTS
===================================================== */

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

            return res.status(500).json({
                success: false,
                message:
                    "Could not load students."
            });
        }
    }
);

/* =====================================================
   ADMIN - UPDATE STUDENT
===================================================== */

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

        const allowed = [
            "fullName",
            "address",
            "mobile",
            "seatNumber",
            "registrationDate"
        ];

        const update = {};

        if (
            req.body.fullName !==
            undefined
        ) {
            update.full_name =
                String(
                    req.body.fullName
                ).trim();
        }

        if (
            req.body.address !==
            undefined
        ) {
            update.address =
                String(
                    req.body.address
                ).trim();
        }

        if (
            req.body.mobile !==
            undefined
        ) {
            update.mobile =
                String(
                    req.body.mobile
                ).trim();
        }

        if (
            req.body.seatNumber !==
            undefined
        ) {
            update.seat_number =
                String(
                    req.body.seatNumber
                ).trim();
        }

        if (
            req.body.registrationDate !==
            undefined
        ) {
            update.admission_date =
                String(
                    req.body.registrationDate
                );
        }

        update.updated_at =
            new Date().toISOString();

        const updated =
            await supabaseRequest(
                "students",
                {
                    method: "PATCH",
                    query:
                        "?id=eq." +
                        encodeURIComponent(
                            student.id
                        ),
                    body: update
                }
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

/* =====================================================
   UPDATE FEE
===================================================== */

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
                new Date().getFullYear()
            );

        const month =
            String(
                req.params.month ||
                req.body.month ||
                ""
            );

        if (!months.includes(month)) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid month."
            });
        }

        const monthlyFees =
            normalizeFees(
                student.monthly_fees
            );

        const feesByYear =
            normalizeObject(
                student.fees_by_year
            );

        if (!feesByYear[year]) {
            feesByYear[year] = {};
        }

        const oldFee =
            monthlyFees[month] || {
                amount: 700,
                status: "DUE",
                paidDate: "",
                paymentDate: "",
                paymentMode: "",
                receiptNumber: "",
                receiptUrl: "",
                admissionStatus: "OPEN"
            };

        const fee = {
            ...oldFee
        };

        Object.keys(
            req.body || {}
        ).forEach(key => {

            if (
                req.body[key] !==
                undefined &&
                key !== "month"
            ) {
                fee[key] =
                    req.body[key];
            }
        });

        fee.amount =
            Number(
                fee.amount || 700
            );

        if (
            String(fee.status)
                .toUpperCase() ===
            "PAID"
        ) {

            fee.status = "PAID";

            fee.paidDate =
                fee.paidDate ||
                fee.paymentDate ||
                today();

            fee.paymentDate =
                fee.paymentDate ||
                fee.paidDate;

            fee.paymentMode =
                fee.paymentMode ||
                "Online";

            fee.receiptNumber =
                fee.receiptNumber ||
                generateReceiptNumber();

            fee.receiptUrl =
                "/api/receipt/" +
                encodeURIComponent(
                    student.enrollment_number
                ) +
                "/" +
                encodeURIComponent(
                    month
                );

        } else {

            fee.status = "DUE";

            fee.paidDate = "";
            fee.paymentDate = "";
            fee.paymentMode = "";
            fee.receiptNumber = "";
            fee.receiptUrl = "";
        }

        monthlyFees[month] =
            fee;

        feesByYear[year][month] =
            fee;

        const updated =
            await supabaseRequest(
                "students",
                {
                    method: "PATCH",
                    query:
                        "?id=eq." +
                        encodeURIComponent(
                            student.id
                        ),
                    body: {
                        monthly_fees:
                            monthlyFees,

                        fees_by_year:
                            feesByYear,

                        updated_at:
                            new Date()
                                .toISOString()
                    }
                }
            );

        return res.json({
            success: true,
            message:
                "Fee updated successfully.",
            fee
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

/* =====================================================
   STUDENT FEES
===================================================== */

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

            const fees =
                normalizeObject(
                    student.fees_by_year
                );

            return res.json({
                success: true,
                year:
                    req.params.year,
                fees:
                    fees[
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

            const fees =
                normalizeObject(
                    student.fees_by_year
                );

            return res.json({
                success: true,
                year:
                    req.params.year,
                fees:
                    fees[
                        req.params.year
                    ] || {}
            });

        } catch {

            return res.status(500).json({
                success: false,
                message:
                    "Could not load fees."
            });
        }
    }
);

/* =====================================================
   RECEIPT PDF DOWNLOAD
===================================================== */

app.get(
    "/api/receipt/:id/:month",
    async (req, res) => {

        try {

            const student =
                await getStudent(
                    req.params.id
                );

            if (!student) {
                return res.status(404).send(
                    "Student not found."
                );
            }

            const month =
                String(
                    req.params.month
                );

            const fees =
                normalizeFees(
                    student.monthly_fees
                );

            const fee =
                fees[month];

            if (!fee) {
                return res.status(404).send(
                    "Fee record not found."
                );
            }

            if (
                String(
                    fee.status
                ).toUpperCase() !==
                "PAID"
            ) {
                return res.status(400).send(
                    "This fee is not marked as PAID."
                );
            }

            const filename =
                "Aradhya-Library-" +
                student.enrollment_number +
                "-" +
                month +
                "-Receipt.pdf";

            res.setHeader(
                "Content-Type",
                "application/pdf"
            );

            res.setHeader(
                "Content-Disposition",
                "attachment; filename=\"" +
                filename +
                "\""
            );

            const doc =
                new PDFDocument({
                    size: "A4",
                    margin: 50
                });

            doc.pipe(res);

            doc.fontSize(22)
                .fillColor("#173f75")
                .text(
                    "Aradhya Library",
                    {
                        align: "center"
                    }
                );

            doc.moveDown(0.3);

            doc.fontSize(15)
                .fillColor("#222")
                .text(
                    "Library Fee Receipt",
                    {
                        align: "center"
                    }
                );

            doc.moveDown();

            doc
                .moveTo(50, 120)
                .lineTo(545, 120)
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
                    "Fee Month",
                    month
                ],
                [
                    "Amount",
                    "Rs. " +
                    Number(
                        fee.amount || 700
                    )
                ],
                [
                    "Payment Date",
                    fee.paymentDate ||
                    fee.paidDate ||
                    "-"
                ],
                [
                    "Payment Mode",
                    fee.paymentMode ||
                    "-"
                ],
                [
                    "Status",
                    "PAID"
                ]
            ];

            rows.forEach(row => {

                doc.fontSize(11)
                    .fillColor("#333")
                    .text(
                        row[0] + ":",
                        70,
                        undefined,
                        {
                            continued: true
                        }
                    );

                doc.font("Helvetica-Bold")
                    .text(
                        "  " + row[1]
                    );

                doc.font(
                    "Helvetica"
                );

                doc.moveDown(0.7);
            });

            doc.moveDown(2);

            doc.fontSize(11)
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
            }
        }
    }
);

/* =====================================================
   ATTENDANCE
===================================================== */

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

        const now =
            new Date();

        const date =
            now.toISOString()
                .slice(0, 10);

        const year =
            String(
                now.getFullYear()
            );

        const time =
            now.toLocaleTimeString(
                "en-IN",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true
                }
            );

        if (!attendance[year]) {
            attendance[year] = {};
        }

        if (!attendance[year][date]) {
            attendance[year][date] = {
                date,
                year,
                month:
                    now.getMonth() + 1,
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

        if (mode === "in") {

            if (record.inTime) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Today's IN attendance is already marked.",
                    attendance: record
                });
            }

            record.inTime = time;
            record.inLatitude =
                latitude ?? "";
            record.inLongitude =
                longitude ?? "";

        } else {

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
                    attendance: record
                });
            }

            record.outTime = time;
            record.outLatitude =
                latitude ?? "";
            record.outLongitude =
                longitude ?? "";
        }

        await supabaseRequest(
            "students",
            {
                method: "PATCH",
                query:
                    "?id=eq." +
                    encodeURIComponent(
                        student.id
                    ),
                body: {
                    attendance_data:
                        attendance,

                    updated_at:
                        new Date()
                            .toISOString()
                }
            }
        );

        return res.json({
            success: true,
            message:
                "Attendance " +
                mode.toUpperCase() +
                " marked successfully.",
            attendance: record
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

app.post(
    "/api/student/attendance/in",
    (req, res) =>
        attendanceAction(
            req,
            res,
            "in"
        )
);

app.post(
    "/api/student/attendance/out",
    (req, res) =>
        attendanceAction(
            req,
            res,
            "out"
        )
);

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

        } catch {

            return res.status(500).json({
                success: false,
                message:
                    "Could not load attendance."
            });
        }
    }
);

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

        } catch {

            return res.status(500).json({
                success: false,
                message:
                    "Could not load attendance."
            });
        }
    }
);

/* =====================================================
   FRONTEND
===================================================== */

app.use(
    express.static(ROOT)
);

app.use(
    (req, res) => {

        if (
            req.path.startsWith(
                "/api/"
            )
        ) {
            return res.status(404).json({
                success: false,
                message:
                    "API route not found."
            });
        }

        res.sendFile(
            path.join(
                ROOT,
                "index.html"
            )
        );
    }
);

/* =====================================================
   START
===================================================== */

app.listen(
    PORT,
    () => {

        console.log(
            "Aradhya Library server running on port " +
            PORT
        );

        console.log(
            "Database: Supabase"
        );
    }
);
