import express from 'express';
import Cart from '../models/Cart.js';

const router = express.Router();

router.get('/:userId', async (req, res) => {
    try {
        const cart = await Cart.findOne({ userId: req.params.userId });
        res.json(cart ? cart.items : []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:userId', async (req, res) => {
    try {
        const { items } = req.body;
        let cart = await Cart.findOne({ userId: req.params.userId });

        if (cart) {
            cart.items = items;
            cart.updatedAt = Date.now();
        } else {
            cart = new Cart({ userId: req.params.userId, items });
        }

        await cart.save();
        res.json({ message: 'Cart saved successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;