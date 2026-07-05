const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'gradebook-secret-key-12345',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
      return { users: {} };
    }
    const data = fs.readFileSync(DB_FILE, 'utf8').trim();
    if (!data) return { users: {} };
    return JSON.parse(data);
  } catch (e) {
    console.error("Database reading error encountered safely resetting memory.");
    return { users: {} };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Database write error:", e);
  }
}

// Google Search Console Verification Route
app.get('/googled65c8d58b8735815.html', (req, res) => {
  res.send('google-site-verification: googled65c8d58b8735815.html');
});

app.post('/api/register', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing parameters" });
    const db = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    if (db.users[normalizedEmail]) return res.status(400).json({ error: "Account exists" });
    
    db.users[normalizedEmail] = { 
      password, 
      classes: {
        "Math": {
          categories: [
            { name: "Exams", weight: 60 },
            { name: "Homework", weight: 40 }
          ],
          assignments: [
            { name: "Midterm", category: "Exams", scoreStr: "85" },
            { name: "Homework 1", category: "Homework", scoreStr: "18/20" }
          ]
        }
      },
      gradingScale: { "Aplus": 97, "A": 93, "Aminus": 90, "Bplus": 87, "B": 83, "Bminus": 80, "Cplus": 77, "C": 73, "Cminus": 70, "Dplus": 67, "D": 63, "Dminus": 60, "F": 0 }
    };
    writeDB(db);
    req.session.userEmail = normalizedEmail;
    res.json({ email: normalizedEmail });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    const db = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    const user = db.users[normalizedEmail];
    if (!user || user.password !== password) return res.status(401).json({ error: "Invalid credentials" });
    req.session.userEmail = normalizedEmail;
    res.json({ email: normalizedEmail });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/me', (req, res) => { if (!req.session.userEmail) return res.status(401).json({ error: "Unauthorized" }); res.json({ email: req.session.userEmail }); });

app.get('/api/userdata', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Unauthorized" });
  const db = readDB();
  const user = db.users[req.session.userEmail];
  if (!user) return res.status(404).json({ error: "Missing data state" });
  res.json({ classes: user.classes || {}, gradingScale: user.gradingScale || {} });
});

app.put('/api/userdata', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Unauthorized" });
  const { classes, gradingScale } = req.body;
  const db = readDB();
  if (db.users[req.session.userEmail]) {
    if (classes) db.users[req.session.userEmail].classes = classes;
    if (gradingScale) db.users[req.session.userEmail].gradingScale = gradingScale;
    writeDB(db);
  }
  res.json({ success: true });
});

app.listen(PORT, () => { console.log(`Server executing successfully on port ${PORT}`); });
