import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserLog from '../models/UserLog.js';

export const createUser = async (req, res) => {
    const { name, email, password, role } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
        return res.status(400).json({ message: 'User already exists' });
    }

    const newUser = new User({ name, email, password, role });

    try {
        const createdUser = await newUser.save();

        await UserLog.create({
            action: 'CREATE_USER',
            performedBy: email,
            targetUser: email,
            details: `User ${name} created with role ${role}`,
        });

        res.status(201).json(createdUser);
    } catch (err) {
        res.status(500).json({ message: 'Failed to create user', error: err.message });
    }
};

export const getUser = async (req, res) => {
    const users = await User.find();
    res.json(users);
};

export const getUserById = async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
        res.json(user);
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

export const updateUser = async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
        const originalRole = user.role;

        Object.assign(user, req.body);
        const updated = await user.save();

        if (req.body.role && req.body.role !== originalRole) {
            await UserLog.create({
                action: 'UPDATE_USER_ROLE',
                performedBy: req.body.adminEmail || 'unknown',
                targetUser: user.email,
                details: `Changed role from ${originalRole} to ${req.body.role}`,
            });
        }

        res.json(updated);
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

export const deleteUser = async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
        await user.deleteOne();

        await UserLog.create({
            action: 'DELETE_USER',
            performedBy: req.body.adminEmail || 'unknown',
            targetUser: user.email,
            details: `Deleted user ${user.name}`,
        });

        res.json({ message: 'User deleted' });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

export const updateProfile = async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        const { name, email, password, confirmPassword } = req.body;

        const updates = {};

        if (name && name !== user.name) {
            updates.name = name;
        }

        if (email && email !== user.email) {
            const existing = await User.findOne({ email });
            if (existing && existing._id.toString() !== user._id.toString()) {
                return res.status(400).json({ message: 'Email already in use' });
            }
            updates.email = email;
        }

        if (password) {
            if (password !== confirmPassword) {
                return res.status(400).json({ message: 'Passwords do not match' });
            }
            updates.password = await bcrypt.hash(password, 10);
        }

        Object.assign(user, updates);
        const updatedUser = await user.save();


        res.json({ updatedUser });
    } catch (err) {
        res.status(401).json({ message: 'Invalid token', error: err.message });
    }
};
