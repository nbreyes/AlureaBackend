import dotenv from "dotenv";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// ---------------- MongoDB Schema ----------------
const userSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4 },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "client" },
  isEmailVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

// ---------------- OTP Store ----------------
const otps = new Map(); // temporary in-memory OTPs

// ---------------- Helper: Send OTP ----------------
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sendOtpEmail = async (email, otp) => {
  await transporter.sendMail({
    from: '"Alurea Support" <no-reply@alurea.com>',
    to: email,
    subject: "🔐 Alurea OTP Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
        <h2 style="color: #c5a100;">Alurea Verification</h2>
        <p>Please use the following OTP to complete your login:</p>
        <h1 style="letter-spacing: 4px; color: #333;">${otp}</h1>
        <p>This code expires in <strong>5 minutes</strong>.</p>
        <p>If you didn’t request this, ignore this email.</p>
      </div>
    `,
  });
};

// ---------------- Register ----------------
export const register = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "client",
      isEmailVerified: false,
    });

    // Send verification OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps.set(email, { otp, expires: Date.now() + 5 * 60 * 1000 });
    await sendOtpEmail(email, otp);

    res.status(201).json({ message: "Registration successful. Verify your email using the OTP sent." });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
};

// ---------------- Verify Email ----------------
export const verifyEmail = async (req, res) => {
  const { email, otp } = req.body;
  const record = otps.get(email);
  if (!record) return res.status(400).json({ message: "No OTP found. Please register again." });
  if (record.otp !== otp) return res.status(400).json({ message: "Invalid OTP." });
  if (Date.now() > record.expires) {
    otps.delete(email);
    return res.status(400).json({ message: "OTP expired. Please register again." });
  }
  otps.delete(email);

  await User.updateOne({ email }, { $set: { isEmailVerified: true } });
  res.status(200).json({ message: "Email verified successfully!" });
};

// ---------------- Login ----------------
export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: "Incorrect password" });

    if (!user.isEmailVerified) {
      return res.status(400).json({ message: "Please verify your email first." });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps.set(email, { otp, expires: Date.now() + 5 * 60 * 1000 });
    await sendOtpEmail(email, otp);

    res.status(200).json({
      message: "Login successful. OTP sent to email.",
      requireOTP: true,
      email,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
};

// ---------------- Verify OTP (Login) ----------------
export const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  const record = otps.get(email);
  if (!record) return res.status(400).json({ message: "No OTP found. Please login again." });
  if (record.otp !== otp) return res.status(400).json({ message: "Invalid OTP." });
  if (Date.now() > record.expires) {
    otps.delete(email);
    return res.status(400).json({ message: "OTP expired. Please login again." });
  }
  otps.delete(email);

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: "User not found." });

  const token = jwt.sign({ email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
  const redirectUrl = user.role === "admin" ? "/admin" : "/client";

  res.status(200).json({
    token,
    user: { email: user.email, name: user.name, role: user.role },
    redirectUrl,
  });
};

// ---------------- Update Profile ----------------
export const updateProfile = async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const { name, password, confirmPassword } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (password) {
      if (password !== confirmPassword) return res.status(400).json({ message: "Passwords do not match" });
      updates.password = await bcrypt.hash(password, 10);
    }

    await User.updateOne({ email }, { $set: updates });

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    console.error("Update error:", err);
    res.status(401).json({ message: "Invalid token" });
  }
};
