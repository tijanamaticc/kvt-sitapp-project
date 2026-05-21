const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const uuidv4 = () => crypto.randomUUID();

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const name = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

const DATA_FILE = path.join(__dirname, 'data.json');

function getMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user, pass }
  });
}

async function sendMail(to, subject, text) {
  const transport = getMailTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!transport || !from) {
    console.log('[MAIL MOCK]', { to, subject, text });
    return;
  }

  const info = await transport.sendMail({ from, to, subject, text });
  console.log('Mail sent:', { to, subject, messageId: info.messageId });
}

function sanitizeUser(user) {
  const { password: _p, ...safe } = user;
  return safe;
}

function findUserById(data, id) {
  return data.users.find(u => u.id === id);
}

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return { users: [], conversations: [], messages: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/ping', (_req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  const data = readData();
  const id = (identifier || '').toString().toLowerCase();
  const user = data.users.find(u => [u.username, u.email, u.phone].map(v => (v || '').toLowerCase()).includes(id) && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.accountStatus === 'pending') {
    return res.status(403).json({ error: 'Registration is waiting for admin approval' });
  }
  if (user.accountStatus === 'rejected') {
    return res.status(403).json({ error: 'Registration was rejected by admin' });
  }
  res.json(sanitizeUser(user));
});

app.post('/api/register', upload.single('avatar'), (req, res) => {
  const body = req.body || {};
  const file = req.file;
  console.log('POST /api/register content-type=', req.headers['content-type']);

  // profile may be sent as JSON string when using FormData
  let profile = {};
  if (body.profile) {
    try { profile = JSON.parse(body.profile); } catch (e) { profile = body.profile; }
  }

  const data = readData();
  const user = {
    id: uuidv4(),
    username: body.username,
    email: body.email,
    phone: body.phone,
    password: body.password,
    role: 'student',
    accountStatus: 'pending',
    profile: {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      displayName: profile.displayName || body.username,
      bio: profile.bio || '',
      status: profile.status || '',
      avatarUrl: file ? `/uploads/${file.filename}` : (profile.avatarUrl || null)
    }
  };
  data.users.unshift(user);
  writeData(data);
  sendMail(
    user.email,
    'SitApp - zahtev za registraciju primljen',
    `Pozdrav ${user.profile.displayName},\n\nTvoj zahtev za registraciju je primljen i čeka odobrenje administratora. Nakon odobrenja dobijaš obaveštenje mejlom.\n\nSitApp`
  ).catch((error) => console.error('Mail error:', error.message));
  res.status(201).json(sanitizeUser(user));
});

// Accept JSON registrations (fallback for clients that POST JSON)
app.post('/api/register-json', (req, res) => {
  const body = req.body || {};
  const data = readData();
  const user = {
    id: uuidv4(),
    username: body.username,
    email: body.email,
    phone: body.phone,
    password: body.password,
    role: 'student',
    accountStatus: 'pending',
    profile: {
      firstName: (body.profile && body.profile.firstName) || '',
      lastName: (body.profile && body.profile.lastName) || '',
      displayName: (body.profile && body.profile.displayName) || body.username,
      bio: (body.profile && body.profile.bio) || '',
      status: (body.profile && body.profile.status) || '',
      avatarUrl: (body.profile && body.profile.avatarUrl) || null
    }
  };
  data.users.unshift(user);
  writeData(data);

  sendMail(
    user.email,
    'SitApp - zahtev za registraciju primljen',
    `Pozdrav ${user.profile.displayName},\n\nTvoj zahtev za registraciju je primljen i čeka odobrenje administratora. Nakon odobrenja dobijaš obaveštenje mejlom.\n\nSitApp`
  ).catch((error) => console.error('Mail error:', error.message));

  res.status(201).json(sanitizeUser(user));
});

app.get('/api/registrations', (req, res) => {
  const data = readData();
  const status = (req.query.status || 'pending').toString();
  const users = status === 'all' ? data.users : data.users.filter((user) => user.accountStatus === status || (status === 'pending' && !user.accountStatus));
  res.json(users.map(sanitizeUser));
});

// Admin: list all users
app.get('/api/users', (req, res) => {
  const data = readData();
  res.json(data.users.map(sanitizeUser));
});

// Admin: delete user
app.delete('/api/users/:id', (req, res) => {
  const data = readData();
  const idx = data.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const removed = data.users.splice(idx, 1)[0];
  writeData(data);
  res.json(sanitizeUser(removed));
});

app.post('/api/registrations/:id/approve', async (req, res) => {
  const data = readData();
  const user = findUserById(data, req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.accountStatus = 'approved';
  user.profile.lastActivityAt = new Date().toISOString();
  writeData(data);

  sendMail(
    user.email,
    'SitApp - registracija odobrena',
    `Pozdrav ${user.profile.displayName},\n\nAdministrator je odobrio tvoju registraciju. Sada možeš da se prijaviš u sistem.\n\nSitApp`
  ).catch((error) => console.error('Mail error:', error.message));

  res.json(sanitizeUser(user));
});

app.post('/api/registrations/:id/reject', async (req, res) => {
  const data = readData();
  const user = findUserById(data, req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.accountStatus = 'rejected';
  user.profile.lastActivityAt = new Date().toISOString();
  writeData(data);

  sendMail(
    user.email,
    'SitApp - registracija odbijena',
    `Pozdrav ${user.profile.displayName},\n\nNažalost, administrator je odbio tvoj zahtev za registraciju.\n\nSitApp`
  ).catch((error) => console.error('Mail error:', error.message));

  res.json(sanitizeUser(user));
});

app.put('/api/users/:id/profile', (req, res) => {
  const data = readData();
  const user = findUserById(data, req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const body = req.body || {};
  user.username = body.username || user.username;
  user.email = body.email || user.email;
  user.phone = body.phone || user.phone;
  user.profile = {
    ...user.profile,
    firstName: body.firstName || user.profile.firstName || '',
    lastName: body.lastName || user.profile.lastName || '',
    displayName: body.displayName || user.profile.displayName,
    bio: body.bio || '',
    status: body.status || '',
    avatarUrl: body.avatarUrl ?? user.profile.avatarUrl,
    lastActivityAt: new Date().toISOString()
  };
  writeData(data);
  res.json(sanitizeUser(user));
});

app.put('/api/users/:id/password', async (req, res) => {
  const data = readData();
  const user = findUserById(data, req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || user.password !== currentPassword) {
    return res.status(400).json({ error: 'Invalid password data' });
  }

  user.password = newPassword;
  user.profile.lastActivityAt = new Date().toISOString();
  writeData(data);

  sendMail(
    user.email,
    'SitApp - lozinka je promenjena',
    `Pozdrav ${user.profile.displayName},\n\nTvoja lozinka je uspešno promenjena. Ako nisi ti izvršio ovu promenu, odmah se obrati administratoru.\n\nSitApp`
  ).catch((error) => console.error('Mail error:', error.message));

  res.json(sanitizeUser(user));
});

app.get('/api/conversations', (req, res) => {
  const data = readData();
  res.json(data.conversations);
});

app.post('/api/conversations', (req, res) => {
  const { title, memberIds, description, kind } = req.body;
  const data = readData();
  const conversation = {
    id: uuidv4(),
    kind: kind || 'group',
    title: title || 'Nova grupa',
    memberIds: memberIds || [],
    avatarSeed: title || 'G',
    description: description || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pinned: false,
    unreadCount: 0,
    lastMessageId: null
  };
  data.conversations.unshift(conversation);
  writeData(data);
  res.json(conversation);
});

app.get('/api/conversations/:id/messages', (req, res) => {
  const data = readData();
  const id = req.params.id;
  const messages = data.messages.filter(m => m.conversationId === id).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  res.json(messages);
});

app.post('/api/conversations/:id/messages', (req, res) => {
  const id = req.params.id;
  const { senderId, text, kind } = req.body;
  const data = readData();
  const message = {
    id: uuidv4(),
    conversationId: id,
    senderId,
    text: text || '',
    createdAt: new Date().toISOString(),
    status: 'sent',
    kind: kind || 'text'
  };
  data.messages.push(message);
  const conv = data.conversations.find(c => c.id === id);
  if (conv) {
    conv.lastMessageId = message.id;
    conv.updatedAt = new Date().toISOString();
    conv.unreadCount = (conv.unreadCount || 0) + 1;
  }
  writeData(data);
  res.json(message);
});

const port = process.env.PORT || 3333;
const server = app.listen(port, () => console.log(`SitApp SVT running on http://localhost:${port}`));

// Verify SMTP transport at startup (no sensitive values printed)
const transport = getMailTransport();
if (transport) {
  transport.verify()
    .then(() => console.log('SMTP transport: verified (ready to send).'))
    .catch((err) => console.error('SMTP transport verify failed:', err.message));
} else {
  console.log('SMTP transport: not configured, using mock mail (console logs).');
}

module.exports = server;
