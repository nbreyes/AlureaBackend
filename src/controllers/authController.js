import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

// ---------------- AWS Clients ----------------
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);

// ---------------- Constants ----------------
const USER_TABLE = "Users"; // Users table name in DynamoDB
const otps = new Map(); // temporary OTP storage

// ---------------- Helper: send OTP ----------------
const sendOtpEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

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
    // 1️⃣ Cognito signup
    const command = new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "name", Value: name }],
    });
    await cognito.send(command);

    // 2️⃣ Check if user exists in DynamoDB (scan by email)
    const scanResult = await dynamoDB.send(new ScanCommand({
      TableName: USER_TABLE,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: { "#email": "email" },
      ExpressionAttributeValues: { ":email": email },
    }));

    if (scanResult.Items?.length === 0) {
      // Store user with generated id
      const id = uuidv4();
      await dynamoDB.send(
        new PutCommand({
          TableName: USER_TABLE,
          Item: {
            id,
            email,
            name,
            role: "client",
            isEmailVerified: false,
            createdAt: new Date().toISOString(),
          },
        })
      );
    }

    res.status(201).json({ message: "Registration successful. Verify email via Cognito." });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).json({ message: error.message });
  }
};

// ---------------- Verify Email ----------------
export const verifyEmailCognito = async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ message: "Email and code are required." });

  try {
    await cognito.send(
      new ConfirmSignUpCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      })
    );

    // Update DynamoDB (scan by email to get id first)
    const scanResult = await dynamoDB.send(new ScanCommand({
      TableName: USER_TABLE,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: { "#email": "email" },
      ExpressionAttributeValues: { ":email": email },
    }));
    const user = scanResult.Items[0];
    if (!user) return res.status(404).json({ message: "User not found in DynamoDB" });

    await dynamoDB.send(
      new UpdateCommand({
        TableName: USER_TABLE,
        Key: { id: user.id },
        UpdateExpression: "set isEmailVerified = :verified",
        ExpressionAttributeValues: { ":verified": true },
      })
    );

    res.status(200).json({ message: "Email verified successfully!" });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(400).json({ message: error.message || "Verification failed" });
  }
};

// ---------------- Login ----------------
export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const command = new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    const response = await cognito.send(command);
    const accessToken = response.AuthenticationResult.AccessToken;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otps.set(email, { otp, expires: Date.now() + 5 * 60 * 1000 });

    res.status(200).json({
      message: "Login successful. OTP sent to email.",
      requireOTP: true,
      email,
      accessToken,
    });
    sendOtpEmail(email, otp).catch((err) => {
      console.error("failed to send OTP email: ", err);
    })
  } catch (error) {
    console.error("Login error:", error);
    res.status(400).json({ message: error.message });
  }
};

// ---------------- Verify OTP ----------------
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

  // Scan by email to get user id
  const scanResult = await dynamoDB.send(new ScanCommand({
    TableName: USER_TABLE,
    FilterExpression: "#email = :email",
    ExpressionAttributeNames: { "#email": "email" },
    ExpressionAttributeValues: { ":email": email },
  }));
  const user = scanResult.Items[0];
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

    // Scan to get user id
    const scanResult = await dynamoDB.send(new ScanCommand({
      TableName: USER_TABLE,
      FilterExpression: "#email = :email",
      ExpressionAttributeNames: { "#email": "email" },
      ExpressionAttributeValues: { ":email": email },
    }));
    const user = scanResult.Items[0];
    if (!user) return res.status(404).json({ message: "User not found" });

    const { name, password, confirmPassword } = req.body;
    const updates = {};
    if (name && name !== user.name) updates.name = name;
    if (password) {
      if (password !== confirmPassword) return res.status(400).json({ message: "Passwords do not match" });
      updates.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updates).length > 0) {
      const updateExp = "SET " + Object.keys(updates).map(k => `#${k} = :${k}`).join(", ");
      const exprAttrNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
      const exprAttrValues = Object.fromEntries(Object.entries(updates).map(([k, v]) => [`:${k}`, v]));

      await dynamoDB.send(
        new UpdateCommand({
          TableName: USER_TABLE,
          Key: { id: user.id },
          UpdateExpression: updateExp,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues,
        })
      );
    }

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    res.status(401).json({ message: "Invalid token", error: err.message });
  }
};
