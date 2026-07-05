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
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week
}));

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Auth Routes
app.post('/api/register', (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });
    
    const db = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    
    if (db.users[normalizedEmail]) {
      return res.status(400).json({ error: "Account already exists" });
    }
    
    db.users[normalizedEmail] = { 
      password, 
      courses: [],
      gradingScale: {
        "A": 93, "B": 83, "C": 73, "D": 63
      }
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
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    req.session.userEmail = normalizedEmail;
    res.json({ email: normalizedEmail });
  } catch (err) { next(err); }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" });
  res.json({ email: req.session.userEmail });
});

// Settings / Custom Grading Scale
app.get('/api/settings', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" });
  const db = readDB();
  res.json({ gradingScale: db.users[req.session.userEmail].gradingScale });
});

app.put('/api/settings', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" });
  const { gradingScale } = req.body;
  const db = readDB();
  if (db.users[req.session.userEmail]) {
    db.users[req.session.userEmail].gradingScale = gradingScale;
    writeDB(db);
  }
  res.json({ success: true });
});

// Course Data Routes
app.get('/api/courses', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" });
  const db = readDB();
  res.json({ courses: db.users[req.session.userEmail].courses || [] });
});

app.put('/api/courses', (req, res) => {
  if (!req.session.userEmail) return res.status(401).json({ error: "Not logged in" });
  const { courses } = req.body;
  const db = readDB();
  if (db.users[req.session.userEmail]) {
    db.users[req.session.userEmail].courses = courses;
    writeDB(db);
  }
  res.json({ success: true });
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
