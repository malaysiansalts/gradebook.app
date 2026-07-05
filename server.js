const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// Make sure the data directory exists (it won't be present after a fresh
// git clone/deploy, since empty folders aren't tracked by git).
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// JWT secret: use env var in production. A random one is generated on first
// boot and persisted to disk so restarts don't invalidate existing sessions.
const SECRET_PATH = path.join(__dirname, "data", "jwt-secret.txt");
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (fs.existsSync(SECRET_PATH)) return fs.readFileSync(SECRET_PATH, "utf8");
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, secret);
  return secret;
}
const JWT_SECRET = getSecret();

// ---------- tiny JSON "database" ----------
const DB_PATH = path.join(__dirname, "data", "db.json");
function loadDB() {
  if (!fs.existsSync(DB_PATH)) return { users: [], coursesByUser: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (e) {
    console.error("Failed to parse db.json, starting fresh:", e);
    return { users: [], coursesByUser: {} };
  }
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
let db = loadDB();

function defaultCourse() {
  const uid = () => Math.random().toString(36).slice(2, 10);
  return {
    id: uid(),
    name: "Untitled Course",
    categories: [
      { id: uid(), name: "Homework", weight: 30, open: true, items: [] },
      { id: uid(), name: "Exams", weight: 70, open: true, items: [] },
    ],
  };
}

// ---------- middleware ----------
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Route to handle browser automatic requests for the tab icon (favicon)
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "favicon.ico"));
});

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not logged in." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

function isValidEmail
