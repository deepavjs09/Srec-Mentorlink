// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// ---------- Load users.json ----------
const usersFile = path.join(__dirname, "users.json");
function loadUsers() {
  if (!fs.existsSync(usersFile)) return [];
  return JSON.parse(fs.readFileSync(usersFile));
}
function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// ---------- Email transporter ----------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------- Routes ----------

// Home page
app.get("/", (req, res) => {
  res.send("Hello, Srec-Mentorlink is running 🚀");
});

// Dashboard (after login)
app.get("/dashboard", (req, res) => {
  const email = req.query.email;
  if (!email) return res.send("Email required to login.");

  let users = loadUsers();
  let user = users.find((u) => u.email === email);

  if (!user) {
    // If user not found, create new junior by default
    user = { name: email.split("@")[0], email, role: "junior", interests: [] };
    users.push(user);
    saveUsers(users);
  }

  // Find matched users in same interest domain
  let matchedUsers = [];
  if (user.interests.length > 0) {
    matchedUsers = users.filter(
      (u) =>
        u.email !== user.email &&
        u.interests.some((i) => user.interests.includes(i))
    );
  }

  res.render("dashboard", { user, matchedUsers });
});

// Handle interest submission
app.post("/set-interest", (req, res) => {
  const { email, interest } = req.body;
  let users = loadUsers();
  let user = users.find((u) => u.email === email);

  if (user) {
    if (!user.interests.includes(interest)) {
      user.interests.push(interest);
      saveUsers(users);

      // Notify matching seniors by email
      let seniors = users.filter(
        (u) => u.role === "senior" && u.interests.includes(interest)
      );

      seniors.forEach((senior) => {
        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: senior.email,
          subject: "New Junior Interested in Your Domain",
          text: `Hello ${senior.name}, a junior selected your domain (${interest}). 
Chat with them here: https://your-domain.com/chat?junior=${email}&senior=${senior.email}&user=${senior.email}`,
        };
        transporter.sendMail(mailOptions, (err) => {
          if (err) console.error("Email error:", err);
        });
      });
    }
  }
  res.redirect("/dashboard?email=" + email);
});

// Chat page
app.get("/chat", (req, res) => {
  const { junior, senior, user } = req.query;
  res.render("chat", { juniorEmail: junior, seniorEmail: senior, userEmail: user });
});

// ---------- Socket.io for chat ----------
io.on("connection", (socket) => {
  console.log("User connected");

  socket.on("joinRoom", ({ junior, senior }) => {
    const room = [junior, senior].sort().join("-");
    socket.join(room);
    socket.room = room;
  });

  socket.on("chatMessage", (data) => {
    io.to(socket.room).emit("chatMessage", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// ---------- Feedback routes ----------

// Submit feedback
app.post("/feedback", (req, res) => {
  const feedbacksFile = path.join(__dirname, "feedbacks.json");
  let feedbacks = [];

  if (fs.existsSync(feedbacksFile)) {
    feedbacks = JSON.parse(fs.readFileSync(feedbacksFile));
  }

  feedbacks.push(req.body); // { junior, senior, sender, rating, comments }
  fs.writeFileSync(feedbacksFile, JSON.stringify(feedbacks, null, 2));

  res.status(200).send("Feedback saved successfully");
});

// Feedback page (standalone)
app.get("/feedback", (req, res) => {
  const { junior, senior, user } = req.query;
  if (!junior || !senior || !user) return res.send("Missing parameters.");
  res.render("feedback", { juniorEmail: junior, seniorEmail: senior, userEmail: user });
});

// ---------- Server ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
