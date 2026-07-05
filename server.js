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
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: {} };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.post('/api/register', (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });
    const db = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    if (db.users[normalizedEmail]) return res.status(400).json({ error: "Account already exists" });
    
    db.users[normalizedEmail] = { 
      password, 
      classes: {
        "Math": [
          { name: "Exams", weight: 60, currentAvg: 85 },
          { name: "Homework", weight: 40, currentAvg: 95 }
        ]
      },
      gradingScale: { "Aplus": 97, "A": 93, "Aminus": 90, "Bplus": 87, "B": 83, "Bminus": 80, "Cplus": 77, "C": 73, "Cminus": 70, "Dplus": 67, "D": 63, "Dminus": 60, "F": 0 }
    };
    writeDB(db);
    req.session.userEmail = normalizedEmail;
    res.json({ email: normalizedEmail });
  } catch (err) { next(err); }
});

app.post('/api/login', (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    const user = db.users[normalizedEmail];
    if (!user || user.password !== password) return res.status(401).json({ error: "Invalid email or password" });
    req.session.userEmail = normalizedEmail;
    res.json({ email: normalizedEmail });
  } catch (err) { next(err); }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/me', (req, res) => { if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" }); res.json({ email: req.session.userEmail }); });

// SECURE ROUTE: Sanitizes corrupted user data on-the-fly
app.get('/api/userdata', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" });
  
  const db = readDB();
  const user = db.users[req.session.userEmail];
  if (!user) return res.status(404).json({ error: "User not found" });

  const cleanClasses = {};
  const rawClasses = user.classes || {};

  // Strips legacy "Comp. Wt" properties out of the JSON profile permanently
  Object.keys(rawClasses).forEach(className => {
    if (Array.isArray(rawClasses[className])) {
      cleanClasses[className] = rawClasses[className].map(item => ({
        name: item.name || "Category",
        weight: parseFloat(item.weight) || 0,
        currentAvg: parseFloat(item.currentAvg) || 0
      }));
    } else {
      cleanClasses[className] = [];
    }
  });

  res.json({ classes: cleanClasses, gradingScale: user.gradingScale || {} });
});

app.put('/api/userdata', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" });
  const { classes, gradingScale } = req.body;
  const db = readDB();
  
  if (db.users[req.session.userEmail]) {
    if (classes) db.users[req.session.userEmail].classes = classes;
    if (gradingScale) db.users[req.session.userEmail].gradingScale = gradingScale;
    writeDB(db);
  }
  res.json({ success: true });
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
