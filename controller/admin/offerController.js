import Offer from '../../models/offerModel.js';
import Product from '../../models/productModel.js';
import Category from '../../models/categoryModels.js';
import HTTP_STATUS from '../../utils/httpStatusCodes.js';

const offerController = {
    // Get all offers
    getOffers: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 5; // Number of offers per page
            const skip = (page - 1) * limit;

            const totalOffers = await Offer.countDocuments();
            const totalPages = Math.ceil(totalOffers / limit);

            const offers = await Offer.find()
                .populate('categoryId')
                .populate('productIds')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const products = await Product.find({ isActive: true });
            const categories = await Category.find({ isActive: true });

            res.render('admin/offers', {
                offers,
                products,
                categories,
                admin: req.session.admin,
                currentPage: page,
                totalPages,
                totalOffers,
                startIndex: skip + 1,
                endIndex: Math.min(skip + limit, totalOffers)
            });
        } catch (error) {
            console.error('Get offers error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', {
                message: 'Error fetching offers',
                error: error.message,
                admin: req.session.admin
            });
        }
    },

    
    // Create new offer
    createOffer: async (req, res) => {
        try {
            const {
                name,
                type,
                itemIds,
                discount,
                startDate,
                endDate
            } = req.body;

            // Validate required fields
            if (!name || !type || !itemIds || !discount || !startDate || !endDate) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'All fields are required'
                });
            }

            // Validate dates
            const start = new Date(startDate);
            const end = new Date(endDate);
            const now = new Date();

            start.setMinutes(start.getMinutes() - 330);
            end.setMinutes(end.getMinutes() - 330);
            now.setMinutes(now.getMinutes() - 330);

            if (start < now) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'Start date cannot be in the past'
                });
            }

            if (end <= start) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'End date must be after start date'
                });
            }

            // Check for existing offers with date overlap
            let existingOffers;
            if (type === 'product') {
                existingOffers = await Offer.find({
                    productIds: { $in: itemIds },
                    $or: [
                        {
                            startDate: { $lte: end },
                            endDate: { $gte: start }
                        }
                    ]
                }).populate('productIds');

                if (existingOffers.length > 0) {
                    const products = await Product.find({ _id: { $in: itemIds } });
                    const conflictingProducts = products.filter(product => 
                        existingOffers.some(offer => 
                            offer.productIds.some(p => p._id.toString() === product._id.toString())
                        )
                    );

                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        message: `Following products already have offers for this period: ${conflictingProducts.map(p => p.productName).join(', ')}`
                    });
                }
            } else if (type === 'category') {
                existingOffers = await Offer.find({
                    categoryId: itemIds[0],
                    $or: [
                        {
                            startDate: { $lte: end },
                            endDate: { $gte: start }
                        }
                    ]
                }).populate('categoryId');

                if (existingOffers.length > 0) {
                    const category = await Category.findById(itemIds[0]);
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        message: `Category '${category.name}' already has an offer for this period`
                    });
                }
            }

            // Create offer data
            const offerData = {
                name,
                discount: Number(discount),
                startDate: start,
                endDate: end,
                status: 'active'
            };

            if (type === 'category') {
                offerData.categoryId = itemIds[0];
            } else {
                offerData.productIds = itemIds;
            }

            const offer = await Offer.create(offerData);

            // Update products if it's a product offer
            if (type === 'product') {
                await Product.updateMany(
                    { _id: { $in: itemIds } },
                    {
                        offer: offer._id,
                        offerApplied: true,
                        offerType: 'product'
                    }
                );
            }

            res.json({
                success: true,
                message: 'Offer created successfully',
                offer
            });

        } catch (error) {
            console.error('Create offer error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: error.message || 'Error creating offer'
            });
        }
    },

    // // Get single offer
    // getOffer: async (req, res) => {
    //     try {
    //         const { offerId } = req.params;
    //         const offer = await Offer.findById(offerId)
    //             .populate('productIds')
    //             .populate('categoryId');

    //         if (!offer) {
    //             return res.status(HTTP_STATUS.NOT_FOUND).json({
    //                 success: false,
    //                 message: 'Offer not found'
    //             });
    //         }

    //         res.json({
    //             success: true,
    //             offer
    //         });

    //     } catch (error) {
    //         console.error('Get offer error:', error);
    //         res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    //             success: false,
    //             message: 'Error fetching offer details'
    //         });
    //     }
    // },

    // Update offer
    updateOffer: async (req, res) => {
        try {
            const { offerId } = req.params;
            const {
                name,
                type,
                itemIds,
                discount,
                startDate,
                endDate
            } = req.body;

            // Validate dates
            const start = new Date(startDate);
            const end = new Date(endDate);
            const now = new Date();

            start.setMinutes(start.getMinutes() - 330);
            end.setMinutes(end.getMinutes() - 330);
            now.setMinutes(now.getMinutes() - 330);

            if (start < now) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'Start date cannot be in the past'
                });
            }

            if (end <= start) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: 'End date must be after start date'
                });
            }

            // Check for existing offers with date overlap
            let existingOffers;
            if (type === 'product') {
                existingOffers = await Offer.find({
                    _id: { $ne: offerId },
                    productIds: { $in: itemIds },
                    $or: [
                        {
                            startDate: { $lte: end },
                            endDate: { $gte: start }
                        }
                    ]
                }).populate('productIds');

                if (existingOffers.length > 0) {
                    const products = await Product.find({ _id: { $in: itemIds } });
                    const conflictingProducts = products.filter(product => 
                        existingOffers.some(offer => 
                            offer.productIds.some(p => p._id.toString() === product._id.toString())
                        )
                    );

                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        message: `Following products already have offers for this period: ${conflictingProducts.map(p => p.productName).join(', ')}`
                    });
                }
            } else if (type === 'category') {
                existingOffers = await Offer.find({
                    _id: { $ne: offerId },
                    categoryId: itemIds[0],
                    $or: [
                        {
                            startDate: { $lte: end },
                            endDate: { $gte: start }
                        }
                    ]
                }).populate('categoryId');

                if (existingOffers.length > 0) {
                    const category = await Category.findById(itemIds[0]);
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        success: false,
                        message: `Category '${category.name}' already has an offer for this period`
                    });
                }
            }

            const existingOffer = await Offer.findById(offerId);
            if (!existingOffer) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: 'Offer not found'
                });
            }

            // Remove offer reference from old products
            if (existingOffer.productIds.length > 0) {
                await Product.updateMany(
                    { _id: { $in: existingOffer.productIds } },
                    {
                        offer: null,
                        offerApplied: false,
                        offerType: null
                    }
                );
            }

            // Update offer data
            const updateData = {
                name,
                discount: Number(discount),
                startDate: start,
                endDate: end
            };

            // Update either categoryId or productIds based on type
            if (type === 'category') {
                updateData.categoryId = itemIds[0];
                updateData.productIds = [];
            } else {
                updateData.productIds = itemIds;
                updateData.categoryId = null;
            }

            const updatedOffer = await Offer.findByIdAndUpdate(
                offerId,
                updateData,
                { new: true }
            );

            // Update new products if it's a product offer
            if (type === 'product') {
                await Product.updateMany(
                    { _id: { $in: itemIds } },
                    {
                        offer: updatedOffer._id,
                        offerApplied: true,
                        offerType: 'product'
                    }
                );
            }

            res.json({
                success: true,
                message: 'Offer updated successfully',
                offer: updatedOffer
            });

        } catch (error) {
            console.error('Update offer error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: error.message || 'Error updating offer'
            });
        }
    },

    // Delete offer
    deleteOffer: async (req, res) => {
        try {
            const { offerId } = req.params;
            const offer = await Offer.findById(offerId);

            if (!offer) {
                return res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: 'Offer not found'
                });
            }

            // Remove offer reference from products
            if (offer.productIds.length > 0) {
                await Product.updateMany(
                    { _id: { $in: offer.productIds } },
                    {
                        offer: null,
                        offerApplied: false,
                        offerType: null
                    }
                );
            }

            await offer.deleteOne();

            res.json({
                success: true,
                message: 'Offer deleted successfully'
            });

        } catch (error) {
            console.error('Delete offer error:', error);
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Error deleting offer'
            });
        }
    }
};

export default offerController; 