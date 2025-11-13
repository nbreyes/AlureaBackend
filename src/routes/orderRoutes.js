import express from 'express';
import multer from 'multer';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = 'uploads/proofs/';
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `proof-${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ storage });

router.post('/', async (req, res) => {
    try {
        const { name, address, contact, payment_method, items, totalAmount, latitude, longitude } = req.body;

        const newOrder = new Order({
            name,
            address,
            contact,
            payment_method,
            items,
            totalAmount,
            status: 'Pending',
            date: new Date(),
            latitude,
            longitude,
        });

        await newOrder.save();

        for (const item of items) {
            await Product.findByIdAndUpdate(item._id, {
                $inc: { stock: -item.quantity },
            });
        }

        res.status(201).json({ message: 'Order placed and stock updated successfully' });
    } catch (error) {
        console.error('Order saving error:', error.message);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/', async (req, res) => {
    try {
        const orders = await Order.find().sort({ date: -1 });
        res.json(orders);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch orders' });
    }
});

router.get('/track-order/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json(order);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch order details' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ message: 'Order deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete order' });
    }
});

router.patch('/:id/deliver', async (req, res) => {
    try {
        const orderId = req.params.id;
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { status: 'Delivering' },
            { new: true }
        );

        if (!updatedOrder) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json(updatedOrder);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update order status' });
    }
});

router.post('/:id/deliver-proof', upload.single('photo'), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });

        order.status = 'Delivered';
        order.proofPhoto = req.file.filename;
        await order.save();

        res.json(order);
    } catch (err) {
        console.error('Error uploading delivery proof:', err);
        res.status(500).json({ message: 'Failed to upload delivery proof' });
    }
});

export default router;
