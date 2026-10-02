const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

/* ========================================
   MIDDLEWARE
======================================== */

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ========================================
   PATHS
======================================== */

const projectRoot = path.join(__dirname, "../..");

const dataFolder = path.join(__dirname, "data");

const usersFile = path.join(dataFolder, "users.json");

/* ========================================
   CREATE DATA FOLDER
======================================== */

if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, { recursive: true });
}

/* ========================================
   CREATE USERS FILE
======================================== */

if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, "[]");
}

/* ========================================
   MONTHS
======================================== */

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

/* ========================================
   ADMIN LOGIN
======================================== */

const ADMIN_USERNAME = "AL741774";
const ADMIN_PASSWORD = "Al@8493";

/* ========================================
   HELPER - USERS
======================================== */

function getUsers() {

    try {

        const data = fs.readFileSync(
            usersFile,
            "utf8"
        );

        return JSON.parse(data);

    } catch (error) {

        return [];

    }
}

/* ========================================
   SAVE USERS
======================================== */

function saveUsers(users) {

    fs.writeFileSync(
        usersFile,
        JSON.stringify(users, null, 2)
    );

}

/* ========================================
   CREATE MONTHLY FEES
======================================== */

function createMonthlyFees() {

    const fees = {};

    months.forEach(function(month) {

        fees[month] = {

            amount: 700,

            status: "DUE",

            paidDate: "",

            paymentDate: "",

            paymentMode: "",

            receiptNumber: "",

            admissionStatus: "OPEN"

        };

    });

    return fees;

}

/* ========================================
   FIX OLD STUDENT FEE RECORDS
======================================== */

function ensureMonthlyFees(user) {

    if (!user.monthlyFees) {

        user.monthlyFees =
            createMonthlyFees();

        return;

    }

    months.forEach(function(month) {

        if (!user.monthlyFees[month]) {

            user.monthlyFees[month] = {

                amount: 700,

                status: "DUE",

                paidDate: "",

                paymentDate: "",

                paymentMode: "",

                receiptNumber: "",

                admissionStatus: "OPEN"

            };

        } else {

            const fee =
                user.monthlyFees[month];

            if (!fee.admissionStatus) {
                fee.admissionStatus = "OPEN";
            }

            if (!fee.paymentDate) {
                fee.paymentDate =
                    fee.paidDate || "";
            }

            if (!fee.paymentMode) {
                fee.paymentMode = "";
            }

            if (!fee.receiptNumber) {
                fee.receiptNumber = "";
            }

            fee.amount = 700;

        }

    });

}

/* ========================================
   GENERATE ENROLLMENT NUMBER
======================================== */

function generateEnrollmentNumber() {

    const users = getUsers();

    let enrollmentNumber;

    do {

        const randomNumber =
            Math.floor(
                100000 +
                Math.random() * 900000
            );

        enrollmentNumber =
            "AR" +
            new Date().getFullYear() +
            randomNumber;

    } while (
        users.some(
            user =>
                user.enrollmentNumber ===
                enrollmentNumber
        )
    );

    return enrollmentNumber;

}

/* ========================================
   GENERATE RECEIPT NUMBER
======================================== */

function generateReceiptNumber() {

    const randomNumber =
        Math.floor(
            1000 +
            Math.random() * 9000
        );

    return (
        "AL-FEE-" +
        new Date().getFullYear() +
        "-" +
        randomNumber
    );

}

/* ========================================
   HOME
======================================== */

app.get("/", function(req, res) {

    res.send(
        "Aradhya Library Backend is Running!"
    );

});

/* ========================================
   ADMIN LOGIN
======================================== */

app.post(
    "/api/admin/login",
    function(req, res) {

        const {
            username,
            password
        } = req.body;

        if (
            username === ADMIN_USERNAME &&
            password === ADMIN_PASSWORD
        ) {

            return res.json({

                success: true,

                username: ADMIN_USERNAME,

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

/* ========================================
   REGISTER STUDENT
======================================== */

app.post(
    "/api/register",
    async function(req, res) {

        try {

            const {
                fullName,
                address,
                mobile,
                password
            } = req.body;

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
                !/^[6-9]\d{9}$/.test(mobile)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Enter a valid 10-digit Indian mobile number."

                });

            }

            if (password.length < 6) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be at least 6 characters."

                });

            }

            const users = getUsers();

            const existingUser =
                users.find(
                    user =>
                        user.mobile === mobile
                );

            if (existingUser) {

                return res.status(409).json({

                    success: false,

                    message:
                        "This mobile number is already registered."

                });

            }

            const enrollmentNumber =
                generateEnrollmentNumber();

            const hashedPassword =
                await bcrypt.hash(
                    password,
                    10
                );

            const newUser = {

                id: Date.now(),

                enrollmentNumber:

                    enrollmentNumber,

                fullName:

                    fullName,

                address:

                    address,

                mobile:

                    mobile,

                password:

                    hashedPassword,

                registrationDate: "",

                seatNumber: "",

                monthlyFees:

                    createMonthlyFees(),

                createdAt:

                    new Date().toISOString()

            };

            users.push(newUser);

            saveUsers(users);

            res.status(201).json({

                success: true,

                message:
                    "Registration successful!",

                enrollmentNumber:

                    enrollmentNumber,

                student: {

                    id:
                        newUser.id,

                    enrollmentNumber:
                        newUser.enrollmentNumber,

                    fullName:
                        newUser.fullName,

                    address:
                        newUser.address,

                    mobile:
                        newUser.mobile,

                    registrationDate:
                        newUser.registrationDate,

                    seatNumber:
                        newUser.seatNumber,

                    monthlyFees:
                        newUser.monthlyFees

                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Server error."

            });

        }

    }
);

/* ========================================
   STUDENT LOGIN
======================================== */

app.post(
    "/api/login",
    async function(req, res) {

        try {

            const {
                enrollmentNumber,
                password
            } = req.body;

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

            const users = getUsers();

            const user =
                users.find(
                    student =>
                        student.enrollmentNumber
                            .toLowerCase() ===
                        enrollmentNumber
                            .toLowerCase()
                );

            if (!user) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid Enrollment Number or Password."

                });

            }

            const passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (!passwordMatch) {

                return res.status(401).json({

                    success: false,

                    message:
                        "Invalid Enrollment Number or Password."

                });

            }

            ensureMonthlyFees(user);

            saveUsers(users);

            res.json({

                success: true,

                message:
                    "Login successful.",

                student: {

                    id:
                        user.id,

                    enrollmentNumber:
                        user.enrollmentNumber,

                    fullName:
                        user.fullName,

                    address:
                        user.address,

                    mobile:
                        user.mobile,

                    registrationDate:
                        user.registrationDate || "",

                    seatNumber:
                        user.seatNumber || "",

                    monthlyFees:
                        user.monthlyFees

                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Login server error."

            });

        }

    }
);

/* ========================================
   GET ALL STUDENTS - ADMIN
======================================== */

app.get(
    "/api/admin/students",
    function(req, res) {

        try {

            const users = getUsers();

            users.forEach(function(user) {

                ensureMonthlyFees(user);

            });

            saveUsers(users);

            const students =
                users.map(function(user) {

                    return {

                        id:
                            user.id,

                        enrollmentNumber:
                            user.enrollmentNumber,

                        fullName:
                            user.fullName,

                        address:
                            user.address,

                        mobile:
                            user.mobile,

                        registrationDate:
                            user.registrationDate || "",

                        seatNumber:
                            user.seatNumber || "",

                        monthlyFees:
                            user.monthlyFees

                    };

                });

            res.json({

                success: true,

                students:
                    students

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Unable to load students."

            });

        }

    }
);

/* ========================================
   UPDATE STUDENT DETAILS - PUT
======================================== */

app.put(
    "/api/admin/student/:id",
    function(req, res) {

        try {

            const studentId =
                Number(req.params.id);

            const {
                seatNumber,
                registrationDate
            } = req.body;

            const users = getUsers();

            const user =
                users.find(
                    student =>
                        student.id ===
                        studentId
                );

            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."

                });

            }

            if (
                seatNumber !== undefined
            ) {

                user.seatNumber =
                    seatNumber;

            }

            if (
                registrationDate !== undefined
            ) {

                user.registrationDate =
                    registrationDate;

            }

            saveUsers(users);

            res.json({

                success: true,

                message:
                    "Student details updated.",

                student: {

                    id:
                        user.id,

                    enrollmentNumber:
                        user.enrollmentNumber,

                    fullName:
                        user.fullName,

                    seatNumber:
                        user.seatNumber,

                    registrationDate:
                        user.registrationDate

                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Unable to update student."

            });

        }

    }
);

/* ========================================
   UPDATE STUDENT DETAILS - PATCH
======================================== */

app.patch(
    "/api/admin/students/:id",
    function(req, res) {

        try {

            const studentId =
                Number(req.params.id);

            const {
                seatNumber,
                registrationDate
            } = req.body;

            const users = getUsers();

            const user =
                users.find(
                    student =>
                        student.id ===
                        studentId
                );

            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."

                });

            }

            if (
                seatNumber !== undefined
            ) {

                user.seatNumber =
                    seatNumber;

            }

            if (
                registrationDate !== undefined
            ) {

                user.registrationDate =
                    registrationDate;

            }

            saveUsers(users);

            res.json({

                success: true,

                message:
                    "Student details updated.",

                student: user

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Unable to update student."

            });

        }

    }
);

/* ========================================
   UPDATE MONTHLY FEE - PUT
======================================== */

app.put(
    "/api/admin/student/:id/fee",
    function(req, res) {

        updateMonthlyFee(req, res);

    }
);

/* ========================================
   UPDATE MONTHLY FEE - PATCH
======================================== */

app.patch(
    "/api/admin/students/:id/fee",
    function(req, res) {

        updateMonthlyFee(req, res);

    }
);

/* ========================================
   MONTHLY FEE UPDATE FUNCTION
======================================== */

function updateMonthlyFee(req, res) {

    try {

        const studentId =
            Number(req.params.id);

        const {
            month,
            status,
            paidDate,
            paymentDate,
            paymentMode,
            receiptNumber,
            admissionStatus
        } = req.body;

        if (!months.includes(month)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid month."

            });

        }

        if (
            status !== undefined &&
            status !== "PAID" &&
            status !== "DUE"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Status must be PAID or DUE."

            });

        }

        if (
            admissionStatus !== undefined &&
            admissionStatus !== "OPEN" &&
            admissionStatus !== "CLOSED"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Admission status must be OPEN or CLOSED."

            });

        }

        if (
            status === "PAID" &&
            paymentMode !== "Cash" &&
            paymentMode !== "Online"
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Payment mode must be Cash or Online."

            });

        }

        const users = getUsers();

        const user =
            users.find(
                student =>
                    student.id ===
                    studentId
            );

        if (!user) {

            return res.status(404).json({

                success: false,

                message:
                    "Student not found."

            });

        }

        ensureMonthlyFees(user);

        const fee =
            user.monthlyFees[month];

        fee.amount = 700;

        /* =================================
           ADMISSION STATUS
        ================================= */

        if (
            admissionStatus !== undefined
        ) {

            fee.admissionStatus =
                admissionStatus;

        }

        /* =================================
           FEE STATUS
        ================================= */

        if (status !== undefined) {

            fee.status = status;

        }

        /* =================================
           PAID
        ================================= */

        if (status === "PAID") {

            const finalDate =
                paidDate ||
                paymentDate ||
                new Date()
                    .toISOString()
                    .split("T")[0];

            fee.paidDate =
                finalDate;

            fee.paymentDate =
                finalDate;

            fee.paymentMode =
                paymentMode;

            if (receiptNumber) {

                fee.receiptNumber =
                    receiptNumber;

            }

            if (!fee.receiptNumber) {

                fee.receiptNumber =
                    generateReceiptNumber();

            }

        }

        /* =================================
           DUE
        ================================= */

        if (status === "DUE") {

            fee.paidDate = "";

            fee.paymentDate = "";

            fee.paymentMode = "";

            fee.receiptNumber = "";

        }

        saveUsers(users);

        res.json({

            success: true,

            message:
                month +
                " fee/admission status updated successfully.",

            month:
                month,

            fee:
                fee

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            message:
                "Unable to update fee."

        });

    }

}

/* ========================================
   GET ONE STUDENT
======================================== */

app.get(
    "/api/student/:enrollmentNumber",
    function(req, res) {

        try {

            const enrollmentNumber =
                req.params.enrollmentNumber;

            const users = getUsers();

            const user =
                users.find(
                    student =>
                        student.enrollmentNumber
                            .toLowerCase() ===
                        enrollmentNumber
                            .toLowerCase()
                );

            if (!user) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."

                });

            }

            ensureMonthlyFees(user);

            saveUsers(users);

            res.json({

                success: true,

                student: {

                    id:
                        user.id,

                    enrollmentNumber:
                        user.enrollmentNumber,

                    fullName:
                        user.fullName,

                    address:
                        user.address,

                    mobile:
                        user.mobile,

                    registrationDate:
                        user.registrationDate || "",

                    seatNumber:
                        user.seatNumber || "",

                    monthlyFees:
                        user.monthlyFees

                }

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Unable to load student."

            });

        }

    }
);

/* ========================================
   DELETE STUDENT - ADMIN
======================================== */

app.delete(
    "/api/admin/student/:id",
    function(req, res) {

        try {

            const studentId =
                Number(req.params.id);

            const users = getUsers();

            const index =
                users.findIndex(
                    student =>
                        student.id ===
                        studentId
                );

            if (index === -1) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."

                });

            }

            users.splice(index, 1);

            saveUsers(users);

            res.json({

                success: true,

                message:
                    "Student deleted successfully."

            });

        } catch (error) {

            console.error(error);

            res.status(500).json({

                success: false,

                message:
                    "Unable to delete student."

            });

        }

    }
);

/* ========================================
   SERVE WEBSITE
======================================== */

app.use(
    express.static(projectRoot)
);

/* ========================================
   START SERVER
======================================== */

app.listen(
    PORT,
    function() {

        console.log(
            "Aradhya Library server running on http://localhost:" +
            PORT
        );

    }
);