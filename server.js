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

// Helper to read/write persistent database file
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
app.post('/api/register', (expressRes, next) => {
  try {
    const { email, password } = expressRes.req.body;
    if (!email || !password) return expressRes.status(400).json({ error: "Missing email or password" });
    
    const db = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    
    if (db.users[normalizedEmail]) {
      return expressRes.status(400).json({ error: "Account already exists" });
    }
    
    db.users[normalizedEmail] = { password, courses: [] };
    writeDB(db);
    
    expressRes.req.session.userEmail = normalizedEmail;
    expressRes.json({ email: normalizedEmail });
  } catch (err) { next(err); }
});

app.post('/api/login', (expressRes, next) => {
  try {
    const { email, password } = expressRes.req.body;
    const db = readDB();
    const normalizedEmail = email.toLowerCase().trim();
    
    const user = db.users[normalizedEmail];
    if (!user || user.password !== password) {
      return expressRes.status(401).json({ error: "Invalid email or password" });
    }
    
    expressRes.req.session.userEmail = normalizedEmail;
    expressRes.json({ email: normalizedEmail });
  } catch (err) { next(err); }
});

app.post('/api/logout', (expressRes) => {
  expressRes.req.session.destroy();
  expressRes.json({ success: true });
});

app.get('/api/me', (expressRes) => {
  if (!expressRes.req.session.userEmail) return expressRes.status(401).json({ error: "Not logged in" });
  expressRes.json({ email: expressRes.req.session.userEmail });
});

// Course Data Routes
app.get('/api/courses', (expressRes) => {
  if (!expressRes.req.session.userEmail) return expressRes.status(401).json({ error: "Not logged in" });
  const db = readDB();
  const user = db.users[expressRes.req.session.userEmail];
  expressRes.json({ courses: user.courses || [] });
});

app.put('/api/courses', (expressRes) => {
  if (!expressRes.req.session.userEmail) return expressRes.status(401).json({ error: "Not logged in" });
  const { courses } = expressRes.req.body;
  const db = readDB();
  
  if (db.users[expressRes.req.session.userEmail]) {
    db.users[expressRes.req.session.userEmail].courses = courses;
    writeDB(db);
  }
  expressRes.json({ success: true });
});

app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
