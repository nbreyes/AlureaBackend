import express from 'express';
import { register, login, verifyOtp, verifyEmailCognito  } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/verify-cognito-email', verifyEmailCognito);

export default router;