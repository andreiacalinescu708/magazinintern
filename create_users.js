const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const users = [
  { id: "u1", username: "admin", password: "admin123", role: "admin", active: true },
  { id: "u2", username: "user1", password: "user123", role: "user", active: true },
  { id: "u3", username: "user2", password: "user123", role: "user", active: true },
  { id: "u4", username: "user3", password: "user123", role: "user", active: true },
];

const out = users.map(u => ({
  id: u.id,
  username: u.username,
  role: u.role,
  active: u.active,
  passwordHash: bcrypt.hashSync(u.password, 10)
}));

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(USERS_FILE, JSON.stringify(out, null, 2), "utf8");

console.log("✅ users.json creat:", USERS_FILE);
console.log("Conturi:");
users.forEach(u => console.log(`- ${u.username} / ${u.password} (${u.role})`));
