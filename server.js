const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// Make sure the data directory exists
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// JWT secret setup
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

// ---------- middleware & global animations inject ----------
app.use(express.json());
app.use(cookieParser());

// This global middleware hooks into all HTML requests to dynamically inject 
// professional entrance animations, card movements, and button states app-wide.
app.use((req, res, next) => {
  const send = res.send;
  res.send = function (body) {
    if (typeof body === 'string' && body.includes('<head>') && !body.includes('/* Global Animations Flag */')) {
      const animationStyleBlock = `
        <head>
        <style>
          /* 1. Global Page Entrance Transition */
          body {
            animation: appEntrance 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          
          @keyframes appEntrance {
            from { opacity: 0; transform: scale(0.99); filter: blur(4px); }
            to { opacity: 1; transform: scale(1); filter: blur(0); }
          }

          /* 2. Animate all Containers, Boxes, List Items and Cards */
          div, form, section, .card, li, tr {
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            animation: componentSlideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
          }

          @keyframes componentSlideUp {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
          }

          /* 3. Smooth Micro-interactions on Buttons & Inputs */
          button, input, select, textarea, a {
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }

          button:hover, a:hover {
            transform: translateY(-2px);
            filter: brightness(1.1);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }

          button:active, a:active {
            transform: translateY(0px) scale(0.98);
          }

          input:focus, select:focus {
            transform: scale(1.01);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.25);
          }
        </style>
      `;
      body = body.replace('<head>', animationStyleBlock);
    }
    send.call(this, body);
  };
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// Route to handle browser automatic requests for favicon/tab icon
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

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAdminEmail(email) {
  const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  return !!adminEmail && email === adminEmail;
}

function requireAdmin(req, res, next) {
  const user = db.users.find((u) => u.id === req.userId);
  if (!user || !isAdminEmail(user.email)) {
    return res.status(403).json({ error: "Access denied. Administrator privileges required." });
  }
  next();
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
  res.json({ email: normalizedEmail, isAdmin: isAdminEmail(normalizedEmail) });
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
  res.json({ email: user.email, isAdmin: isAdminEmail(user.email) });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(401).json({ error: "Not logged in." });
  res.json({ email: user.email, isAdmin: isAdminEmail(user.email) });
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

// ---------- admin infrastructure dashboard ----------
app.get("/api/admin/dashboard", requireAuth, requireAdmin, (req, res) => {
  const cleanUsers = db.users.map(({ id, email }) => ({ id, email }));
  res.json({
    systemStatus: "ONLINE",
    totalUsersCount: db.users.length,
    registeredAccounts: cleanUsers,
    rawCourseDatabaseDump: db.coursesByUser
  });
});

app.get("/admin", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gradebooks - Developer Console</title>
      <link rel="icon" type="image/png" href="/favicon.ico">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
          background: #0f172a; 
          color: #f8fafc; 
          padding: 40px;
          margin: 0;
        }
        
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(74, 222, 128, 0); }
          100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
        }

        h1 { color: #38bdf8; margin-bottom: 5px; }
        p.subtitle { margin-top: 0; color: #94a3b8; }
        
        .card { 
          background: #1e293b; 
          border-radius: 12px; 
          padding: 24px; 
          margin-top: 20px; 
          border: 1px solid #334155;
        }

        .status-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          background: #4ade80;
          border-radius: 50%;
          margin-right: 6px;
          animation: pulseGlow 2s infinite;
          vertical-align: middle;
        }

        pre { 
          background: #020617; 
          padding: 18px; 
          border-radius: 8px; 
          overflow-x: auto; 
          color: #4ade80; 
          border: 1px solid #1e293b;
          font-family: Menlo, Monaco, monospace;
          font-size: 14px;
          line-height: 1.5;
        }

        .error { 
          color: #f87171; 
          background: #451a03; 
          padding: 15px; 
          border-radius: 6px; 
          display: none;
          border: 1px solid #78350f;
        }
      </style>
    </head>
    <body>
      <h1>Developer Console</h1>
      <p class="subtitle">System Variable Environment Target: <strong>${process.env.ADMIN_EMAIL || 'UNSET'}</strong></p>
      
      <div id="error-box" class="error"></div>
      
      <div id="dashboard-content" style="display:none;">
        <div class="card">
          <h3>System Performance</h3>
          <p>Database Status: <span class="status-dot"></span> Connected</p>
          <p>Active Users Stored: <strong style="color: #38bdf8;" id="user-count">0</strong></p>
        </div>
        <div class="card">
          <h3>App Database Dump (db.json payload)</h3>
          <pre id="db-dump">Loading system metrics...</pre>
        </div>
      </div>

      <script>
        async function loadMetrics() {
          try {
            const res = await fetch('/api/admin/dashboard');
            if (!res.ok) {
              const errData = await res.json();
              document.getElementById('error-box').innerText = "Access Forbidden: " + (errData.error || "You are not designated as ADMIN_EMAIL in Railway variables.");
              document.getElementById('error-box').style.display = 'block';
              return;
            }
            const data = await res.json();
            document.getElementById('user-count').innerText = data.totalUsersCount;
            document.getElementById('db-dump').innerText = JSON.stringify(data, null, 2);
            document.getElementById('dashboard-content').style.display = 'block';
          } catch(e) {
            document.getElementById('error-box').innerText = "Connection lost or server is offline.";
            document.getElementById('error-box').style.display = 'block';
          }
        }
        loadMetrics();
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Gradebooks server running on http://localhost:${PORT}`);
});
