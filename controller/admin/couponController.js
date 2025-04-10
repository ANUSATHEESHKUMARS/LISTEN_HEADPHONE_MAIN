import Coupon from '../../models/couponModel.js'
import { HTTP_STATUS } from "../../utils/httpStatusCodes.js";


const adminCouponController = {
    // Get all coupons
    getCoupons: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 5; // Number of coupons per page
            const skip = (page - 1) * limit;

            // Get total number of coupons
            const totalCoupons = await Coupon.countDocuments();
            const totalPages = Math.ceil(totalCoupons / limit);

            // Get paginated coupons
            const coupons = await Coupon.find()
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            // Calculate start and end index for display
            const startIndex = skip;
            const endIndex = Math.min(skip + limit, totalCoupons);

            res.render('admin/coupon', { 
                coupons,
                currentPage: page,
                totalPages,
                totalCoupons,
                startIndex,
                endIndex
            });
        } catch (error) {
            console.error('Error fetching coupons:', error);
            res.status(500).json({ message: 'Error fetching coupons' });
        }
    },

    // Add new coupon
    addCoupon: async (req, res) => {
        try {
            const {
                code,
                description,
                discountPercentage,
                minimumPurchase,
                maximumDiscount,
                startDate,
                expiryDate,
                totalCoupon,
                userUsageLimit
            } = req.body;

            // Validate description
            if (!description || description.trim().length === 0) {
                return res.status(400).json({ message: 'Description is required' });
            }

            if (description.length > 100) {
                return res.status(400).json({ message: 'Description must be less than 100 characters' });
            }

            // Validate discount percentage
            if (discountPercentage < 0 || discountPercentage > 100) {
                return res.status(400).json({ message: 'Discount percentage must be between 0 and 100' });
            }

            // Check if coupon code already exists
            const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
            if (existingCoupon) {
                return res.status(400).json({ message: 'Coupon code already exists' });
            }

            // Create new coupon
            const newCoupon = new Coupon({
                code: code.toUpperCase(),
                description: description.trim(),
                discountPercentage,
                minimumPurchase: minimumPurchase || 0,
                maximumDiscount: maximumDiscount || null,
                startDate,
                expiryDate,
                totalCoupon: totalCoupon || null,
                userUsageLimit: userUsageLimit || 1
            });

            await newCoupon.save();
            res.status(HTTP_STATUS.OK).json({ message: 'Coupon added successfully' });
        } catch (error) {
            console.error('Error adding coupon:', error);
            res.status(500).json({ message: 'Error adding coupon' });
        }
    },

    // Get coupon details
    getCouponDetails: async (req, res) => {
        try {
            const coupon = await Coupon.findById(req.params.id);
            if (!coupon) {
                return res.status(404).json({ message: 'Coupon not found' });
            }
            res.json(coupon);
        } catch (error) {
            console.error('Error fetching coupon details:', error);
            res.status(500).json({ message: 'Error fetching coupon details' });
        }
    },

    // Update coupon
    updateCoupon: async (req, res) => {
        try {
            const {
                code,
                description,
                discountPercentage,
                minimumPurchase,
                maximumDiscount,
                startDate,
                expiryDate,
                totalCoupon,
                userUsageLimit
            } = req.body;

            // Validate discount percentage
            if (discountPercentage < 0 || discountPercentage > 100) {
                return res.status(400).json({ message: 'Discount percentage must be between 0 and 100' });
            }

            // Check if updated code conflicts with existing coupons
            const existingCoupon = await Coupon.findOne({
                code: code.toUpperCase(),
                _id: { $ne: req.params.id }
            });
            if (existingCoupon) {
                return res.status(400).json({ message: 'Coupon code already exists' });
            }

            const updatedCoupon = await Coupon.findByIdAndUpdate(
                req.params.id,
                {
                    code: code.toUpperCase(),
                    description,
                    discountPercentage,
                    minimumPurchase: minimumPurchase || 0,
                    maximumDiscount: maximumDiscount || null,
                    startDate,
                    expiryDate,
                    totalCoupon: totalCoupon || null,
                    userUsageLimit: userUsageLimit || 1
                },
                { new: true }
            );

            if (!updatedCoupon) {
                return res.status(404).json({ message: 'Coupon not found' });
            }

            res.status(HTTP_STATUS.OK).json({ message: 'Coupon updated successfully' });
        } catch (error) {
            console.error('Error updating coupon:', error);
            res.status(500).json({ message: 'Error updating coupon' });
        }
    },

    // Delete coupon
    deleteCoupon: async (req, res) => {
        try {
            const deletedCoupon = await Coupon.findByIdAndDelete(req.params.id);
            if (!deletedCoupon) {
                return res.status(404).json({ message: 'Coupon not found' });
            }
            res.status(HTTP_STATUS.OK).json({ message: 'Coupon deleted successfully' });
        } catch (error) {
            console.error('Error deleting coupon:', error);
            res.status(500).json({ message: 'Error deleting coupon' });
        }
    },

    // Toggle coupon status
    toggleCouponStatus: async (req, res) => {
        try {
            const coupon = await Coupon.findById(req.params.id);
            if (!coupon) {
                return res.status(404).json({ message: 'Coupon not found' });
            }

            coupon.isActive = !coupon.isActive;
            await coupon.save();

            res.status(HTTP_STATUS.OK).json({ 
                message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully` 
            });
        } catch (error) {
            console.error('Error toggling coupon status:', error);
            res.status(500).json({ message: 'Error updating coupon status' });
        }
    }
};

export default adminCouponController;
