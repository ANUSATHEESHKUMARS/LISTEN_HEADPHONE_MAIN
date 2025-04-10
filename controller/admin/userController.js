import User from '../../models/userModels.js';
import HTTP_STATUS from '../../utils/httpStatusCodes.js';

// Get the list of all users with pagination
const getUserList = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Users per page
        const skip = (page - 1) * limit;

        // Get total count for pagination
        const totalUsers = await User.countDocuments();
        const totalPages = Math.ceil(totalUsers / limit);

        const userList = await User.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // If it's an AJAX request, return partial view
        if (req.xhr) {
            return res.render('admin/userList', {
                userList,
                pagination: {
                    currentPage: page,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                    nextPage: page + 1,
                    prevPage: page - 1
                }
            });
        }

        // Regular page load
        res.render('admin/userList', {
            userList,
            pagination: {
                currentPage: page,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
                nextPage: page + 1,
                prevPage: page - 1
            }
        });
    } catch (error) {
        console.error(error);
        if (req.xhr) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch users' });
        }
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server error');
    }
};

const getToggle = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'User not found' });
        }

        user.blocked = !user.blocked;
        await user.save();

        // Return JSON response for API calls
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({ 
                success: true, 
                message: `User successfully ${user.blocked ? 'blocked' : 'unblocked'}`
            });
        }

        // Fallback to redirect for regular form submissions
        res.redirect('/admin/userList');
    } catch (err) {
        console.error(err);
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'Server Error' });
        }
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server Error');
    }
};

export default { getUserList, getToggle }