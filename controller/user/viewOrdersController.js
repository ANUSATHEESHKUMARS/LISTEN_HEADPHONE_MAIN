import orderSchema from "../../models/orderModels.js";
import userSchema from "../../models/userModels.js";
import productSchema from "../../models/productModel.js";
import Wallet from "../../models/walletModels.js";
import PDFDocument from "pdfkit"
import HTTP_STATUS from "../../utils/httpStatusCodes.js";

const getOrders = async (req, res) => {
    try {
        const user = await userSchema.findById(req.session.user);
        const userId = req.session.user;
        const page = parseInt(req.query.page) || 1;
        const limit = 5;

        const totalOrders = await orderSchema.countDocuments({ userId })
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await orderSchema.find({ userId })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('items.product');

        // Ensure payment data exists and is properly formatted
        const processedOrders = orders.map(order => {
            const orderObj = order.toObject();
            
            // Ensure each item has correct pricing
            orderObj.items = orderObj.items.map(item => ({
                ...item,
                price: item.price || 0,
                discountedPrice: item.discountedPrice || item.price || 0,
                subtotal: item.discountedPrice 
                    ? item.discountedPrice * item.quantity 
                    : (item.price * item.quantity) || 0,
                return: item.return || {
                    isReturnRequested: false,
                    reason: null,
                    requestDate: null,
                    status: null,
                    adminComment: null,
                    isReturnAccepted: false
                },
                product: item.product || {
                    productName: 'Product Unavailable',
                    imageUrl: ['/images/placeholder.jpg'],
                    price: item.price || 0
                }
            }));

            // Ensure shipping address has all required fields
            orderObj.shippingAddress = {
                fullName: orderObj.shippingAddress?.fullName || 'Name not available',
                mobileNumber: orderObj.shippingAddress?.mobileNumber || 'Not available',
                addressLine1: orderObj.shippingAddress?.addressLine1 || '',
                addressLine2: orderObj.shippingAddress?.addressLine2 || '',
                city: orderObj.shippingAddress?.city || '',
                state: orderObj.shippingAddress?.state || '',
                pincode: orderObj.shippingAddress?.pincode || ''
            };

            return {
                ...orderObj,
                payment: {
                    method: orderObj.payment?.method || 'Not Available',
                    paymentStatus: orderObj.payment?.paymentStatus || 'pending'
                }
            };
        });

        console.log('Processed orders:', processedOrders); // Debug log

        res.render("user/viewOrder", {
            orders: processedOrders,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            user
        });

    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Error fetching orders',
            error: error.message
        });
    }
}

// Add this function to handle refunds to wallet
const handleWalletRefund = async (userId, amount, orderId, description) => {
    try {
        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = await Wallet.create({ userId, balance: 0 });
        }

        // Ensure amount is properly rounded
        const refundAmount = Math.round(amount * 100) / 100;

        const refundTransaction = {
            type: 'credit',
            amount: refundAmount,
            description: description || `Refund for cancelled order #${orderId}`,
            orderId: orderId,
            date: new Date()
        };

        // Update wallet balance with exact amount
        wallet.balance = Math.round((wallet.balance + refundAmount) * 100) / 100;
        wallet.transactions.push(refundTransaction);
        await wallet.save();

        return true;
    } catch (error) {
        console.error('Wallet refund error:', error);
        return false;
    }
};

// Update the cancelOrder function
const cancelOrder = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const userId = req.session.user;

        const order = await orderSchema.findOne({
            _id: orderId,
            userId
        });

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Find the specific item in the order
        const orderItem = order.items.find(item => 
            item.product.toString() === productId
        );

        if (!orderItem) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'Product not found in order'
            });
        }

        // Check if item can be cancelled
        if (!['processing', 'pending'].includes(orderItem.order.status)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Order cannot be cancelled at this stage'
            });
        }

        // Calculate refund amount with discount
        let refundAmount = orderItem.subtotal;
        
        if (order.discount && order.subtotal > 0) {
            // Calculate the discount ratio for this specific item
            const discountRatio = order.discount / order.subtotal;
            // Apply the proportional discount to this item's subtotal
            const itemDiscount = orderItem.subtotal * discountRatio;
            refundAmount = orderItem.subtotal - itemDiscount;

            console.log('Refund Calculation:', {
                orderSubtotal: order.subtotal,
                orderDiscount: order.discount,
                itemSubtotal: orderItem.subtotal,
                discountRatio: discountRatio,
                itemDiscount: itemDiscount,
                finalRefundAmount: refundAmount
            });
        }

        // Update order item status
        orderItem.order.status = 'cancelled';
        orderItem.order.statusHistory.push({
            status: 'cancelled',
            date: new Date(),
            comment: 'Order cancelled by customer'
        });

        // Process refund based on payment method
        if (['razorpay', 'wallet'].includes(order.payment.method)) {
            // Handle refund to wallet with exact amount
            const refundSuccess = await handleWalletRefund(
                userId, 
                Math.round(refundAmount * 100) / 100, // Round to 2 decimal places
                orderId,
                `Refund for cancelled order #${order._id} (Including applied discounts)`
            );

            if (!refundSuccess) {
                throw new Error('Failed to process refund to wallet');
            }

            // Add refund status to history with exact amount
            orderItem.order.statusHistory.push({
                status: 'refunded',
                date: new Date(),
                comment: `Refund of ₹${refundAmount.toFixed(2)} processed to wallet (Including discounts)`
            });
        }

        // Restore product stock
        await productSchema.findByIdAndUpdate(
            productId,
            { $inc: { stock: orderItem.quantity } }
        );

        await order.save();

        res.json({
            success: true,
            message: `Order cancelled successfully. Refund of ₹${refundAmount.toFixed(2)} will be processed to your wallet.`
        });

    } catch (error) {
        console.error('Cancel order error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || 'Error cancelling order'
        });
    }
};

// Update the requestReturnItem function to handle refunds similarly
const requestReturnItem = async (req, res) => {
    try {
        const { orderId, productId } = req.params;
        const { reason } = req.body;
        const userId = req.session.user;

        const order = await orderSchema.findOne({
            _id: orderId,
            userId
        });

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'Order not found'
            });
        }

        const orderItem = order.items.find(item => 
            item.product.toString() === productId
        );

        if (!orderItem) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'Product not found in order'
            });
        }

        // Update return status
        orderItem.return = {
            isReturnRequested: true,
            reason: reason,
            requestDate: new Date(),
            status: 'pending',
            adminComment: null,
            isReturnAccepted: false
        };

        // Add to status history
        orderItem.order.statusHistory.push({
            status: 'return requested',
            date: new Date(),
            comment: `Return requested: ${reason}`
        });

        await order.save();

        res.json({
            success: true,
            message: 'Return request submitted successfully'
        });

    } catch (error) {
        console.error('Return request error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || 'Error processing return request'
        });
    }
};

const generateInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;

        // Find the order and populate necessary fields
        const order = await orderSchema.findOne({ _id: orderId, userId })
            .populate('userId')
            .populate('items.product');

        if (!order) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ 
                success: false,
                message: 'Order not found' 
            });
        }

        // Create PDF document
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order._id}.pdf`);

        // Pipe the PDF directly to the response
        doc.pipe(res);

        // Add content to PDF
        doc.fontSize(20)
            .text('INVOICE', { align: 'center' })
            .moveDown();

        // Add company details
        doc.fontSize(12)
            .text('LISTEN HEADPHONES', { align: 'left' })
            .text('123 Street, City')
            .text('Phone: +1234567890')
            .text('Email: example@listen.com')
            .moveDown();

        // Add customer details
        doc.text(`Order ID: ${order._id}`)
            .text(`Date: ${order.createdAt.toLocaleDateString()}`)
            .text(`Customer Name: ${order.shippingAddress.fullName}`)
            .text(`Address: ${order.shippingAddress.addressLine1}`)
            .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}`)
            .moveDown();

        // Add items table
        doc.text('Items:', { underline: true }).moveDown();
        
        order.items.forEach(item => {
            doc.text(`${item.product.productName}`)
               .text(`Quantity: ${item.quantity}`)
               .text(`Price: ₹${item.price}`)
               .text(`Subtotal: ₹${item.subtotal}`)
               .moveDown();
        });

        // Add total
        doc.moveDown()
           .text(`Subtotal: ₹${order.subtotal}`, { align: 'right' });

        if (order.discount > 0) {
            doc.text(`Discount: -₹${order.discount}`, { align: 'right' });
        }

        doc.text(`Total Amount: ₹${order.totalAmount}`, { align: 'right' })
           .moveDown();

        // Finalize the PDF
        doc.end();

    } catch (error) {
        console.error('Generate invoice error:', error);
        if (!res.headersSent) {
            res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
                success: false,
                message: 'Error generating invoice'
            });
        }
    }
};


export default {
    getOrders,
    cancelOrder,
    requestReturnItem,
    generateInvoice
}