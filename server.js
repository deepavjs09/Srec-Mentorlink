const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ------------------ Data Storage ------------------ //
const usersFile = path.join(__dirname, 'users.json');
const messagesFile = path.join(__dirname, 'messages.json');
const feedbackFile = path.join(__dirname, 'feedback.json');

let users = [];
let messages = [];
let feedbacks = [];

// Safe JSON load function
const safeJSONLoad = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data.trim()) return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
  }
  return [];
};

// Load data safely
users = safeJSONLoad(usersFile);
messages = safeJSONLoad(messagesFile);
feedbacks = safeJSONLoad(feedbackFile);

// ------------------ Nodemailer ------------------ //
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ------------------ Routes ------------------ //

// Home redirect
app.get('/', (req, res) => res.redirect('/login'));

// Registration
app.get('/register', (req, res) => res.render('register'));
app.post('/register', (req, res) => {
  const { name, email, password, role, interests } = req.body;
  if (!email.endsWith('@srec.ac.in')) {
    return res.send('Only SREC college emails allowed');
  }
  if (users.find(u => u.email === email)) return res.send('User already exists');

  const newUser = {
    name,
    email,
    password,
    role,
    interests: role === 'senior' ? interests.split(',').map(i => i.trim()) : [],
    assignedMentors: [],
    assignedJuniors: []
  };
  users.push(newUser);
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.redirect('/login');
});

// Login
app.get('/login', (req, res) => res.render('login'));
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.send('Invalid credentials');
  res.redirect(`/dashboard?email=${email}`);
});

// Dashboard
app.get('/dashboard', (req, res) => {
  const user = users.find(u => u.email === req.query.email);
  res.render('dashboard', { user, users });
});

// Select Interest (Junior)
app.post('/select-interest', (req, res) => {
  const { email, interest } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.send('User not found');
  user.interests = [interest];

  // Assign senior automatically
  const availableSenior = users.find(u => u.role === 'senior' && u.interests.includes(interest));
  if (availableSenior) {
    user.assignedMentors.push(availableSenior.email);
    availableSenior.assignedJuniors.push(user.email);

    // Send email notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: availableSenior.email,
      subject: `New Junior Assigned: ${user.name}`,
      text: `Hello ${availableSenior.name}, a junior selected your domain (${interest}). Chat here: http://localhost:${process.env.PORT || 3000}/chat?junior=${user.email}&senior=${availableSenior.email}`
    };
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.log(err);
      else console.log('Email sent: ', info.response);
    });
  }

  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.redirect(`/dashboard?email=${email}`);
});

// Edit Interests (Senior)
app.post('/edit-interests', (req, res) => {
  const { email, interests } = req.body;
  const user = users.find(u => u.email === email);
  if (!user) return res.send('User not found');
  user.interests = interests.split(',').map(i => i.trim());
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  res.redirect(`/dashboard?email=${email}`);
});

// Feedback
app.get('/feedback', (req, res) => {
  const { senior, junior } = req.query;
  res.render('feedback', { seniorEmail: senior, juniorEmail: junior });
});
app.post('/submit-feedback', (req, res) => {
  const { seniorEmail, juniorEmail, rating, comments } = req.body;
  feedbacks.push({ seniorEmail, juniorEmail, rating, comments });
  fs.writeFileSync(feedbackFile, JSON.stringify(feedbacks, null, 2));
  res.send('Thank you for your feedback!');
});

// ------------------ Socket.io ------------------ //
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('joinRoom', (room) => {
    socket.join(room);
    const roomMessages = messages.filter(m => m.room === room);
    socket.emit('loadMessages', roomMessages);
  });

  socket.on('chatMessage', (data) => {
    messages.push(data);
    fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
    io.to(data.room).emit('chatMessage', data);
  });

  socket.on('disconnect', () => console.log('A user disconnected'));
});

// ------------------ Start Server ------------------ //
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
