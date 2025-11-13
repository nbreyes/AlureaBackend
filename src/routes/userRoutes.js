import express from 'express';
import {
    createUser,
    getUser,
    getUserById,
    updateUser,
    deleteUser,
    updateProfile
} from '../controllers/userController.js';
import UserLog from '../models/UserLog.js';

const router = express.Router();

router.route('/')
    .get(getUser)
    .post(createUser);

router.get('/logs/all', async (req, res) => {
    try {
        const logs = await UserLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch logs', error: err.message });
    }
});

router.put('/update-profile', updateProfile); 

router.route('/:id')
    .get(getUserById)
    .put(updateUser)
    .delete(deleteUser);

export default router;