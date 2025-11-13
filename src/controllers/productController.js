import Product from '../models/Product.js';
import ProductLog from '../models/ProductLog.js';

// 🟢 Get all products
export const getProducts = async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch products', error: err.message });
    }
};

// 🟢 Get product by ID
export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (product) {
            res.json(product);
        } else {
            res.status(404).json({ message: 'Product not found' });
        }
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch product', error: err.message });
    }
};

// 🟢 Create new product
export const createProduct = async (req, res) => {
    const { name, description, type, material, price, stock, adminEmail } = req.body;

    try {
        const product = new Product({
            name,
            description,
            type,
            material,
            price: parseFloat(price),
            stock: parseInt(stock),
        });

        const createdProduct = await product.save();

        // Log creation
        try {
            await ProductLog.create({
                action: 'CREATE_PRODUCT',
                performedBy: adminEmail || 'Unknown Admin',
                targetProduct: createdProduct.name,
                details: `Created product "${createdProduct.name}" (${createdProduct.type}).`,
            });
        } catch (logError) {
            console.error('Logging failed:', logError.message);
        }

        res.status(201).json(createdProduct);
    } catch (err) {
        res.status(500).json({ message: 'Failed to create product', error: err.message });
    }
};

// 🟢 Update existing product
export const updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const originalProduct = { ...product._doc };

        Object.assign(product, {
            ...req.body,
            price: req.body.price ? parseFloat(req.body.price) : product.price,
            stock: req.body.stock ? parseInt(req.body.stock) : product.stock,
        });

        const updatedProduct = await product.save();

        const performedBy = req.body.adminEmail || 'Unknown Admin';
        const changes = [];

        if (req.body.name && req.body.name !== originalProduct.name) {
            changes.push(`Name: changed from "${originalProduct.name}" to "${req.body.name}"`);
        }
        if (req.body.price && req.body.price !== originalProduct.price) {
            changes.push(`Price: changed from ₱${originalProduct.price} to ₱${req.body.price}`);
        }
        if (req.body.stock && req.body.stock !== originalProduct.stock) {
            changes.push(`Stock: changed from ${originalProduct.stock} to ${req.body.stock}`);
        }
        if (req.body.type && req.body.type !== originalProduct.type) {
            changes.push(`Type: changed from "${originalProduct.type}" to "${req.body.type}"`);
        }
        if (req.body.material && req.body.material !== originalProduct.material) {
            changes.push(`Material: changed from "${originalProduct.material}" to "${req.body.material}"`);
        }

        const detailMessage = changes.length > 0
            ? changes.join(', ')
            : `Product "${originalProduct.name}" was updated (no significant changes).`;

        // Log update
        try {
            await ProductLog.create({
                action: 'UPDATE_PRODUCT',
                performedBy,
                targetProduct: updatedProduct.name,
                details: detailMessage,
            });
        } catch (logError) {
            console.error('Logging failed:', logError.message);
        }

        res.json(updatedProduct);
    } catch (err) {
        res.status(500).json({ message: 'Failed to update product', error: err.message });
    }
};

// 🟢 Delete product
export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        await product.deleteOne();

        // Log deletion
        try {
            await ProductLog.create({
                action: 'DELETE_PRODUCT',
                performedBy: req.body.adminEmail || 'Unknown Admin',
                targetProduct: product.name,
                details: `Deleted product "${product.name}".`,
            });
        } catch (logError) {
            console.error('Logging failed:', logError.message);
        }

        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete product', error: err.message });
    }
};
