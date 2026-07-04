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

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- auth routes ----------
app.post("/api/register", (req, res) => {
  const { email, password } = req.body || {};
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (db.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }
  const id = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.users.push({ id, email: normalizedEmail, passwordHash });
  db.coursesByUser[id] = [defaultCourse()];
  saveDB(db);

  const token = jwt.sign({ sub: id }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ email: normalizedEmail });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = (email || "").trim().toLowerCase();
  const user = db.users.find((u) => u.email === normalizedEmail);
  if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ email: user.email });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(401).json({ error: "Not logged in." });
  res.json({ email: user.email });
});

// ---------- course data routes ----------
app.get("/api/courses", requireAuth, (req, res) => {
  const courses = db.coursesByUser[req.userId] || [];
  res.json({ courses });
});

app.put("/api/courses", requireAuth, (req, res) => {
  const { courses } = req.body || {};
  if (!Array.isArray(courses)) {
    return res.status(400).json({ error: "Invalid course data." });
  }
  db.coursesByUser[req.userId] = courses;
  saveDB(db);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Gradebook server running on http://localhost:${PORT}`);
});
