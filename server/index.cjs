const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
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
  const { password: _p, ...safe } = user;
  res.json(safe);
});

app.post('/api/register', upload.single('avatar'), (req, res) => {
  const body = req.body || {};
  const file = req.file;

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
  const { password: _p, ...safe } = user;
  res.json(safe);
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
app.listen(port, () => console.log(`SitApp SVT running on http://localhost:${port}`));
