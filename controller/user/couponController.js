import Coupon from '../../models/couponModel.js';
import userSchema from '../../models/userModels.js';
import HTTP_STATUS from '../../utils/httpStatusCodes.js';

const couponController = {
    getCoupons: async (req, res) => {
        try {
            const currentDate = new Date();

            const user = await userSchema.findById(req.session.user);
            
            // Find active coupons that haven't expired
            const coupons = await Coupon.find({
                isActive: true,
                startDate: { $lte: currentDate },
                expiryDate: { $gt: currentDate }
            }).sort({ createdAt: -1 });

            // Filter out coupons that have reached their usage limit
            const availableCoupons = coupons.filter(coupon => {
                if (!coupon.totalCoupon) return true;
                return coupon.usedCouponCount < coupon.totalCoupon;
            });

            res.render('user/coupon', { coupons: availableCoupons, user });
            
        } catch (error) {
            console.error('Get coupons error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', { 
                message: 'Error fetching coupons'
            });
        }
    }
};

export default couponController; 