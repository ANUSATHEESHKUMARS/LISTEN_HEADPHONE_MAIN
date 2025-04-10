import addressSchema from '../../models/addressModels.js';
import userSchema from '../../models/userModels.js';
import HTTP_STATUS from '../../utils/httpStatusCodes.js';

const getAddress = async (req, res) => {
    try {
        const user = await userSchema.findById(req.session.user);
        const addresses = await addressSchema.find({ userId: req.session.user });
        res.render('user/address', { addresses, user });
    } catch (error) {
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Internal server error' });
    }
};

const addAddress = async (req, res) => {
    try {
        // Check existing addresses count
        const addressCount = await addressSchema.countDocuments({ userId: req.session.user });
        
        if (addressCount >= 3) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
                error: 'You can only add up to 3 addresses. Please delete an existing address to add a new one.' 
            });
        }

        const { fullName, mobileNumber, addressLine1, addressLine2, city, state, pincode } = req.body;

        const address = new addressSchema({
            userId: req.session.user,
            fullName,
            mobileNumber,
            addressLine1,
            addressLine2,
            city,
            state,
            pincode
        });

        await address.save();
        res.status(HTTP_STATUS.OK).json({ message: 'Address added successfully' });
    } catch (error) {
        console.error('Error adding address:', error);
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

const deleteAddress = async (req, res) => {
    try {
        await addressSchema.findByIdAndDelete(req.params.id);
        res.status(HTTP_STATUS.OK).json({ message: 'Address deleted successfully' });
    } catch (error) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

const editAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const { fullName, mobileNumber, addressLine1, addressLine2, city, state, pincode } = req.body;
        
        if (!fullName || !mobileNumber || !addressLine1 || !city || !state || !pincode) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'All required fields must be filled' });
        }

        const updatedAddress = await addressSchema.findByIdAndUpdate(
            addressId,
            {
                fullName,
                mobileNumber,
                addressLine1,
                addressLine2,
                city,
                state,
                pincode
            },
            { new: true }
        );

        if (!updatedAddress) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Address not found' });
        }

        res.status(HTTP_STATUS.OK).json({ message: 'Address updated successfully' });
    } catch (error) {
        console.error('Error updating address:', error);
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: error.message });
    }
};

export default {
     getAddress,
     addAddress, 
     deleteAddress,
      editAddress };