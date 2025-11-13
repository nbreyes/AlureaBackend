import express from 'express';
import {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    deleteProduct
} from '../controllers/productController.js';
import ProductLog from '../models/ProductLog.js';

const router = express.Router();

router.route('/')
    .get(getProducts)
    .post(createProduct);

router.get('/logs/all', async (req, res) => {
    try {
        const logs = await ProductLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch logs', error: err.message });
    }
    });

router.route('/:id')
    .get(getProductById)
    .put(updateProduct)
    .delete(deleteProduct);

export default router;