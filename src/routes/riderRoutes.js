import express from 'express';
import User from '../models/User';  

const router = express.Router();

router.get('/location/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId);

        if (user) {
            if (user.role === 'rider') {
                return res.json({
                    lat: user.latitude,
                    lon: user.longitude  
                });
            } else {
                return res.status(403).json({ message: 'User is not a rider' });
            }
        } else {
            return res.status(404).json({ message: 'User not found' });
        }
    } catch (err) {
        console.error("Error fetching user location:", err);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
});

export default router;
