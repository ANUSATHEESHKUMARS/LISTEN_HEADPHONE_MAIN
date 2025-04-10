import Wishlist from '../../models/wishlistModels.js';
import Product from '../../models/productModel.js';
import HTTP_STATUS from '../../utils/httpStatusCodes.js';

const wishlistController = {
    getWishlist: async (req, res) => {
        try {
            const userId = req.session.user;
            const wishlist = await Wishlist.findOne({ userId })
                .populate({
                    path: 'items.productId',
                    populate: {
                        path: 'categoriesId'
                    }
                });

            // Filter out unavailable products
            const validItems = wishlist ? wishlist.items.filter(item => 
                item.productId && 
                item.productId.isActive && 
                item.productId.categoriesId?.isActive
            ) : [];

            res.render('user/wishlist', {
                wishlistItems: validItems,
                user: req.session.user
            });
        } catch (error) {
            console.error('Get wishlist error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', { 
                message: 'Error loading wishlist',
                user: req.session.user 
            });
        }
    },

    addToWishlist: async (req, res) => {
        try {
            const userId = req.session.user;
            const { productId } = req.body;

            // Check if product exists and is active
            const product = await Product.findById(productId)
                .populate('categoriesId');

            if (!product || !product.isActive || !product.categoriesId?.isActive) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'Product is not available'
                });
            }

            let wishlist = await Wishlist.findOne({ userId });

            if (!wishlist) {
                wishlist = new Wishlist({
                    userId,
                    items: [{ productId }]
                });
            } else {
                // Check if product already exists in wishlist
                const existingItem = wishlist.items.find(
                    item => item.productId.toString() === productId
                );

                if (existingItem) {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        message: 'Product already in wishlist'
                    });
                }

                wishlist.items.push({ productId });
            }

            await wishlist.save();

            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Product added to wishlist'
            });
        } catch (error) {
            console.error('Add to wishlist error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Failed to add to wishlist'
            });
        }
    },

    removeFromWishlist: async (req, res) => {
        try {
            const userId = req.session.user;
            const { productId } = req.params;

            const result = await Wishlist.updateOne(
                { userId },
                { $pull: { items: { productId } } }
            );

            if (result.modifiedCount === 0) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: 'Product not found in wishlist'
                });
            }

            res.status(HTTP_STATUS.OK).json({
                success: true,
                message: 'Product removed from wishlist'
            });
        } catch (error) {
            console.error('Remove from wishlist error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Failed to remove from wishlist'
            });
        }
    },

    checkWishlistStatus: async (req, res) => {
        try {
            const userId = req.session.user;
            const { productId } = req.params;

            const wishlist = await Wishlist.findOne({
                userId,
                'items.productId': productId
            });

            res.json({
                success: true,
                isInWishlist: !!wishlist
            });
        } catch (error) {
            console.error('Check wishlist status error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Error checking wishlist status'
            });
        }
    },

    toggleWishlist: async (req, res) => {
        try {
            const userId = req.session.user;
            const { productId } = req.body;

            // Check if product exists and is active
            const product = await Product.findById(productId)
                .populate('categoriesId');

            if (!product || !product.isActive || !product.categoriesId?.isActive) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'Product is not available'
                });
            }

            let wishlist = await Wishlist.findOne({ userId });
            let added = false;

            if (!wishlist) {
                wishlist = new Wishlist({
                    userId,
                    items: [{ productId }]
                });
                added = true;
            } else {
                // Check if product already exists in wishlist
                const existingItemIndex = wishlist.items.findIndex(
                    item => item.productId.toString() === productId
                );

                if (existingItemIndex > -1) {
                    // Remove if exists
                    wishlist.items.splice(existingItemIndex, 1);
                    added = false;
                } else {
                    // Add if doesn't exist
                    wishlist.items.push({ productId });
                    added = true;
                }
            }

            await wishlist.save();

            res.status(HTTP_STATUS.OK).json({
                success: true,
                added,
                message: added ? 'Added to wishlist' : 'Removed from wishlist'
            });
        } catch (error) {
            console.error('Toggle wishlist error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Failed to update wishlist'
            });
        }
    }
};

export default wishlistController; 