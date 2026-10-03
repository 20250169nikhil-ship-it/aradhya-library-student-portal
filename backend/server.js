const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

/* =========================================
   ADMIN CONFIG
========================================= */

const ADMIN_USERNAME =
    process.env.ADMIN_USERNAME || "AL741774";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "CHANGE_ME_ADMIN_PASSWORD";

const OLD_ADMIN_TOKEN =
    "ARADHYA_ADMIN_ACCESS";


/* =========================================
   MIDDLEWARE
========================================= */

app.use(cors());

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


/* =========================================
   PATHS
========================================= */

const projectRoot =
    path.join(__dirname, "..");

const dataFolder =
    process.env.DATA_DIR ||
    path.join(__dirname, "data");

const usersFile =
    path.join(
        dataFolder,
        "users.json"
    );


/* =========================================
   CREATE DATA FOLDER
========================================= */

if (!fs.existsSync(dataFolder)) {

    fs.mkdirSync(
        dataFolder,
        {
            recursive: true
        }
    );

}


/* =========================================
   CREATE USERS FILE
========================================= */

if (!fs.existsSync(usersFile)) {

    fs.writeFileSync(
        usersFile,
        "[]",
        "utf8"
    );

}


/* =========================================
   MONTHS
========================================= */

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


/* =========================================
   GET USERS
========================================= */

function getUsers() {

    try {

        const data =
            fs.readFileSync(
                usersFile,
                "utf8"
            );

        const users =
            JSON.parse(data);

        return Array.isArray(users)
            ? users
            : [];

    } catch (error) {

        console.error(
            "GET USERS ERROR:",
            error
        );

        return [];

    }

}


/* =========================================
   SAVE USERS
========================================= */

function saveUsers(users) {

    fs.writeFileSync(

        usersFile,

        JSON.stringify(
            users,
            null,
            2
        ),

        "utf8"

    );

}


/* =========================================
   CREATE MONTHLY FEES
========================================= */

function createMonthlyFees() {

    const fees = {};

    months.forEach(
        function(month) {

            fees[month] = {

                amount: 700,

                status: "DUE",

                paidDate: "",

                paymentDate: "",

                paymentMode: "",

                receiptNumber: "",

                admissionStatus: "OPEN"

            };

        }
    );

    return fees;

}


/* =========================================
   ENSURE MONTHLY FEES
========================================= */

function ensureMonthlyFees(user) {

    if (!user.monthlyFees) {

        user.monthlyFees =
            createMonthlyFees();

        return;

    }


    months.forEach(
        function(month) {

            if (
                !user.monthlyFees[month]
            ) {

                user.monthlyFees[month] = {

                    amount: 700,

                    status: "DUE",

                    paidDate: "",

                    paymentDate: "",

                    paymentMode: "",

                    receiptNumber: "",

                    admissionStatus: "OPEN"

                };

                return;

            }


            const fee =
                user.monthlyFees[month];


            fee.amount = 700;


            if (!fee.status) {

                fee.status = "DUE";

            }


            if (!fee.admissionStatus) {

                fee.admissionStatus =
                    "OPEN";

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

        }
    );

}


/* =========================================
   GENERATE ENROLLMENT NUMBER
========================================= */

function generateEnrollmentNumber() {

    const users =
        getUsers();

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
            function(user) {

                return (
                    user.enrollmentNumber ===
                    enrollmentNumber
                );

            }
        )

    );


    return enrollmentNumber;

}


/* =========================================
   GENERATE RECEIPT NUMBER
========================================= */

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


/* =========================================
   ADMIN AUTH CHECK
========================================= */

function checkAdmin(
    req,
    res,
    next
) {

    const authHeader =
        req.headers.authorization || "";


    const token =
        authHeader
            .replace(
                "Bearer ",
                ""
            )
            .trim();


    if (

        token !== OLD_ADMIN_TOKEN &&

        !token.startsWith("ADMIN-")

    ) {

        return res.status(401).json({

            success: false,

            message:
                "Unauthorized. Admin login required."

        });

    }


    next();

}


/* =========================================
   HOME
========================================= */

app.get(
    "/",
    function(req, res) {

        res.send(
            "Aradhya Library Backend is Running!"
        );

    }
);


/* =========================================
   ADMIN LOGIN
========================================= */

app.post(
    "/api/admin/login",
    function(req, res) {

        try {

            const {
                username,
                password
            } = req.body;


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


        } catch (error) {

            console.error(
                "ADMIN LOGIN ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Admin login server error."

            });

        }

    }
);


/* =========================================
   REGISTER STUDENT
========================================= */

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


            if (
                password.length < 6
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Password must be at least 6 characters."

                });

            }


            const users =
                getUsers();


            const existingUser =
                users.find(
                    function(user) {

                        return (
                            user.mobile ===
                            mobile
                        );

                    }
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

                id:
                    Date.now(),

                enrollmentNumber:
                    enrollmentNumber,

                fullName:
                    fullName.trim(),

                address:
                    address.trim(),

                mobile:
                    mobile.trim(),

                password:
                    hashedPassword,

                registrationDate:
                    "",

                seatNumber:
                    "",

                monthlyFees:
                    createMonthlyFees(),

                createdAt:
                    new Date().toISOString()

            };


            users.push(
                newUser
            );


            saveUsers(
                users
            );


            return res.status(201).json({

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

            console.error(
                "REGISTRATION ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Registration server error."

            });

        }

    }
);


/* =========================================
   STUDENT LOGIN
========================================= */

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


            const users =
                getUsers();


            const user =
                users.find(
                    function(student) {

                        return (

                            String(
                                student.enrollmentNumber
                            ).toLowerCase() ===

                            String(
                                enrollmentNumber
                            ).toLowerCase()

                        );

                    }
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


            ensureMonthlyFees(
                user
            );


            saveUsers(
                users
            );


            return res.json({

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
                        user.monthlyFees || {}

                }

            });


        } catch (error) {

            console.error(
                "STUDENT LOGIN ERROR:",
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


/* =========================================
   GET ALL STUDENTS - ADMIN
========================================= */

app.get(
    "/api/admin/students",
    checkAdmin,
    function(req, res) {

        try {

            const users =
                getUsers();


            users.forEach(
                function(user) {

                    ensureMonthlyFees(
                        user
                    );

                }
            );


            saveUsers(
                users
            );


            const students =
                users.map(
                    function(user) {

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
                                user.monthlyFees || {},

                            createdAt:
                                user.createdAt

                        };

                    }
                );


            console.log(
                "ADMIN STUDENTS:",
                students.length
            );


            return res.json({

                success: true,

                students:
                    students

            });


        } catch (error) {

            console.error(
                "GET STUDENTS ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to load students."

            });

        }

    }
);


/* =========================================
   UPDATE STUDENT DETAILS
========================================= */

app.patch(
    "/api/admin/students/:id",
    checkAdmin,
    function(req, res) {

        try {

            const studentId =
                Number(
                    req.params.id
                );


            const {
                seatNumber,
                registrationDate
            } = req.body;


            const users =
                getUsers();


            const student =
                users.find(
                    function(user) {

                        return (
                            Number(user.id) ===
                            studentId
                        );

                    }
                );


            if (!student) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."

                });

            }


            if (
                seatNumber !== undefined
            ) {

                student.seatNumber =
                    seatNumber;

            }


            if (
                registrationDate !== undefined
            ) {

                student.registrationDate =
                    registrationDate;

            }


            saveUsers(
                users
            );


            return res.json({

                success: true,

                message:
                    "Student details updated successfully.",

                student: {

                    id:
                        student.id,

                    enrollmentNumber:
                        student.enrollmentNumber,

                    fullName:
                        student.fullName,

                    address:
                        student.address,

                    mobile:
                        student.mobile,

                    registrationDate:
                        student.registrationDate,

                    seatNumber:
                        student.seatNumber

                }

            });


        } catch (error) {

            console.error(
                "STUDENT UPDATE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Student update failed."

            });

        }

    }
);


/* =========================================
   UPDATE MONTHLY FEE
========================================= */

app.patch(
    "/api/admin/students/:id/fee",
    checkAdmin,
    function(req, res) {

        try {

            const studentId =
                Number(
                    req.params.id
                );


            const {

                month,

                status,

                paymentDate,

                paymentMode,

                amount,

                receiptNumber,

                admissionStatus

            } = req.body;


            if (
                !month ||
                !months.includes(month)
            ) {

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
                        "Invalid admission status."

                });

            }


            const users =
                getUsers();


            const student =
                users.find(
                    function(user) {

                        return (
                            Number(user.id) ===
                            studentId
                        );

                    }
                );


            if (!student) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."

                });

            }


            ensureMonthlyFees(
                student
            );


            const currentFee =
                student.monthlyFees[
                    month
                ];


            if (status !== undefined) {

                currentFee.status =
                    status;

            }


            if (
                paymentDate !== undefined
            ) {

                currentFee.paymentDate =
                    paymentDate || "";

                currentFee.paidDate =
                    paymentDate || "";

            }


            if (
                paymentMode !== undefined
            ) {

                currentFee.paymentMode =
                    paymentMode || "";

            }


            if (
                receiptNumber !== undefined
            ) {

                currentFee.receiptNumber =
                    receiptNumber || "";

            }


            if (
                amount !== undefined
            ) {

                currentFee.amount =
                    Number(amount) || 700;

            }


            if (
                admissionStatus !== undefined
            ) {

                currentFee.admissionStatus =
                    admissionStatus;

            }


            if (
                currentFee.status === "PAID" &&
                !currentFee.receiptNumber
            ) {

                currentFee.receiptNumber =
                    generateReceiptNumber();

            }


            saveUsers(
                users
            );


            return res.json({

                success: true,

                message:
                    "Fee updated successfully.",

                studentId:
                    studentId,

                month:
                    month,

                fee:
                    currentFee

            });


        } catch (error) {

            console.error(
                "FEE UPDATE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Fee update failed."

            });

        }

    }
);


/* =========================================
   DELETE STUDENT
========================================= */

app.delete(
    "/api/admin/students/:id",
    checkAdmin,
    function(req, res) {

        try {

            const studentId =
                Number(
                    req.params.id
                );


            const users =
                getUsers();


            const index =
                users.findIndex(
                    function(user) {

                        return (
                            Number(user.id) ===
                            studentId
                        );

                    }
                );


            if (index === -1) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found."

                });

            }


            users.splice(
                index,
                1
            );


            saveUsers(
                users
            );


            return res.json({

                success: true,

                message:
                    "Student deleted successfully."

            });


        } catch (error) {

            console.error(
                "DELETE STUDENT ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Unable to delete student."

            });

        }

    }
);


/* =========================================
   SERVE WEBSITE
========================================= */

app.use(
    express.static(
        projectRoot
    )
);


/* =========================================
   START SERVER
========================================= */

app.listen(
    PORT,
    function() {

        console.log(
            "Aradhya Library Backend running on port " +
            PORT
        );

        console.log(
            "Users file:",
            usersFile
        );

    }
);