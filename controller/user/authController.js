import userSchema from '../../models/userModels.js';
import bcrypt from 'bcrypt';
import { generateOTP, sendOTPEmail } from '../../utils/sentOTP.js';
import validatePassword from '../../utils/validatePassword.js ';
import passport from 'passport';
import dotenv from 'dotenv';
import HTTP_STATUS from '../../utils/httpStatusCodes.js';


const saltRounds = 10;

dotenv.config()


export const getContact = async (req, res) => {
    try {
        // Add some logging to debug
        console.log('Rendering contact');
        console.log('Views directory:', req.app.get('views'));
        res.render('user/contact');
    } catch (error) {
        console.error('Error rendering about page:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};


export const getabout = async (req, res) => {
    try {
        // Add some logging to debug
        console.log('Rendering about page');
        console.log('Views directory:', req.app.get('views'));
        res.render('user/about');
    } catch (error) {
        console.error('Error rendering about page:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};


const getSignUp = (req, res) => {
    try {
        res.render('user/signup');
    } catch (error) {
        console.error('Error rendering signup page:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Error loading signup page',
            error: error.message
        });
    }
};
const postSignUp = async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        // Validate first name
        if (!firstName || !/^[a-zA-Z]{3,10}$/.test(firstName.trim())) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'First name should contain only letters (3-10 characters)'
            });
        }

        // Validate last name
        if (!lastName || !/^[a-zA-Z]{1,10}$/.test(lastName.trim())) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Last name should contain only letters (1-10 characters)'
            });
        }

        // Validate email
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: passwordValidation.message
            });
        }

        // Check if user exists
        const existingUser = await userSchema.findOne({ email });

        if (existingUser && !existingUser.isVerified) {
            await userSchema.deleteOne({ _id: existingUser._id });
        } else if (existingUser) {
            const message = !existingUser.password
                ? "This email is linked to a Google login. Please log in with Google."
                : "Email already registered";

            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message
            });
        }

        const otp = generateOTP();
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new userSchema({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email,
            password: hashedPassword,
            otp,
            otpExpiresAt: Date.now() + 120000,
            otpAttempts: 0
        });

        await newUser.save();

        // Schedule deletion after OTP expiry
        setTimeout(async () => {
            const user = await userSchema.findOne({ email });
            if (user && !user.isVerified) {
                await userSchema.deleteOne({ _id: user._id });
            }
        }, 180000);

        await sendOTPEmail(email, otp);
        res.json({
            success: true,
            message: 'OTP sent successfully',
            email: email
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Signup failed'
        });
    }
}

const postOtp = async (req, res) => {
    try {
        const { userOtp, email } = req.body;
        const user = await userSchema.findOne({ email, otp: userOtp });

        if (!user) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Invalid OTP' })
        }
        if (Date.now() > user.otpExpiresAt) {
            if (user.otpAttempts >= 3) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Too many attempts.Please signup again.' })
            }
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Otp expired' })
        }


        // If OTP matches, verify user
        if (user.otp === userOtp) {
            await userSchema.findByIdAndUpdate(user._id, {
                $set: { isVerified: true },
                $unset: { otp: 1, otpExpiresAt: 1, otpAttempts: 1 }
            });

            req.session.user = user._id;
            return res.json({
                success: true,
                message: 'OTP verified successfully',
                redirectUrl: '/home'
            });
        } else {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Invalid OTP' });
        }

    } catch (error) {
        console.error('OTP verification error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: 'OTP verification failed' });
    }
}

const postResendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await userSchema.findOne({ email, isVerified: false });

        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if max attempts reached
        if (user.otpAttempts >= 3) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Maximum attempts reached. Please signup again.'
            });
        }

        // Generate new OTP and update user
        const newOtp = generateOTP();
        user.otp = newOtp;
        user.otpExpiresAt = Date.now() + 120000;
        user.otpAttempts = (user.otpAttempts || 0) + 1;
        await user.save();

        // Send new OTP
        await sendOTPEmail(email, newOtp);

        res.json({
            success: true,
            message: 'OTP resent successfully'
        });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to resend OTP'
        });
    }
};

const getLogin = (req, res) => {
    try {
        res.render('user/login')
    } catch (error) {
        console.error('Error rendering login page:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Error loading login page',
            error: error.message
        });
    }
}

const postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Server-side validation
        if (!email || !password) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Find user
        const user = await userSchema.findOne({ email });

        // Check if user exists
        if (!user) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Your email is not registered. Please signup first."
            });
        }

        if (!user.password) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'This email is linked to a Google login. Please log in with Google.'
            });
        }

        // Check if user is verified
        if (!user.isVerified) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Please verify your email first'
            });
        }

        // Check if user is blocked
        if (user.blocked) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Your account has been blocked'
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Set session
        req.session.user = user._id;
        req.session.userEmail = user.email;

        // Return success response with redirect URL
        return res.json({
            success: true,
            message: 'Login successful',
            redirectUrl: '/home'
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Login failed'
        });
    }
};

const getForgotPassword = (req, res) => {
    try {
        res.render('user/forgotPassword');
    } catch (error) {
        console.error('Error rendering forgot password page:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Error loading forgot password page',
            error: error.message
        });
    }
};

const sendForgotPasswordOTP = async (req, res) => {
    try {
        const { email } = req.body;

        // Find user
        const user = await userSchema.findOne({ email, isVerified: true });
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'User not found' });
        }

        if (!user.password) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                message: 'This email is linked to Google login. Please login with Google.'
            });
        }

        // Generate and save OTP
        const otp = generateOTP();
        user.otp = otp;
        user.otpExpiresAt = Date.now() + 120000;
        user.otpAttempts = 0;
        await user.save();

        // Send OTP email
        await sendOTPEmail(email, otp);

        res.status(HTTP_STATUS.OK).json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: 'Failed to send OTP' });
    }
};

const verifyForgotPasswordOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await userSchema.findOne({
            email,
            otp,
            otpExpiresAt: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Invalid or expired OTP' });
        }

        // Increment attempts
        user.otpAttempts += 1;
        if (user.otpAttempts >= 3) {
            await userSchema.findByIdAndUpdate(user._id, {
                $unset: { otp: 1, otpExpiresAt: 1, otpAttempts: 1 }
            });
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Too many attempts. Please try again.' });
        }
        await user.save();

        if (user.otp !== otp) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Invalid OTP' });
        }

        res.status(HTTP_STATUS.OK).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: 'Failed to verify OTP' });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        const user = await userSchema.findOne({ email });
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'User not found' });
        }

        // Validate new password
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: passwordValidation.message });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password and remove OTP fields
        await userSchema.findByIdAndUpdate(user._id, {
            $set: { password: hashedPassword },
            $unset: { otp: 1, otpExpiresAt: 1, otpAttempts: 1 }
        });

        // Set session for automatic login
        req.session.user = user._id;
        req.session.userEmail = user.email;

        res.status(HTTP_STATUS.OK).json({ 
            message: 'Password reset successfully',
            redirectUrl: '/home'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: 'Failed to reset password' });
    }
};

const getChangePassword = async (req, res) => {
    try {
        // Get user from session
        const userId = req.session.user;
        const user = await userSchema.findById(userId);

        if (!user) {
            return res.redirect('/login');
        }

        // Check if user has a password (not Google login)
        if (!user.password) {
            return res.redirect('/profile');
        }

        // Pass the user object to the view
        res.render('user/changePassword', { user });

    } catch (error) {
        console.error('Get change password error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('error', {
            message: 'Error loading change password page',
            error: error.message
        });
    }
};

const postChangePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.session.user;

        const user = await userSchema.findById(userId);
        if (!user) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ message: 'User not found' });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: 'Current password is incorrect' });
        }

        // Validate new password
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: passwordValidation.message });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await userSchema.findByIdAndUpdate(userId, {
            password: hashedPassword
        });

        res.status(HTTP_STATUS.OK).json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: 'Failed to update password' });
    }
};

const getGoogle = (req, res) => {
    // Store the trigger in session before redirecting to Google
    req.session.authTrigger = req.query.trigger;

    passport.authenticate("google", {
        scope: ["email", "profile"],
    })(req, res);
};

const getGoogleCallback = (req, res) => {

    passport.authenticate("google", { failureRedirect: "/login" }, async (err, profile) => {
        try {
            if (err || !profile) {
                return res.redirect("/login?message=Authentication failed&alertType=error");
            }

            const existingUser = await userSchema.findOne({ email: profile.email });

            const names = profile.displayName.split(' ');
            const firstName = names[0];
            const lastName = names.slice(1).join(' ')

            // If user exists, check if blocked before logging in
            if (existingUser) {
                // Check if user is blocked
                if (existingUser.blocked) {
                    return res.redirect("/login?message=Your account has been blocked&alertType=error");
                }

                // Update googleId if it doesn't exist and unset otpAttempts
                await userSchema.findByIdAndUpdate(existingUser._id, {
                    $set: { googleId: existingUser.googleId || profile.id },
                    $unset: { otpAttempts: 1 }
                });

                req.session.user = existingUser._id;
                return res.redirect("/home");
            }

            // If user doesn't exist, create new account
            const newUser = new userSchema({
                firstName: firstName,
                lastName: lastName,
                email: profile.email,
                googleId: profile.id,
                isVerified: true,
            });
            await newUser.save();
            await userSchema.findByIdAndUpdate(newUser._id, {
                $unset: { otpAttempts: 1 }
            });

            req.session.user = newUser._id;
            return res.redirect("/home");

        } catch (error) {
            console.error("Google authentication error:", error);
            return res.redirect("/login?message=Authentication failed&alertType=error");
        }
    })(req, res);
};

const getLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: "Logout failed" });
        }

        res.clearCookie('connect.sid'); 
        res.redirect('/user/login');  
    });
};


export default {
    getSignUp,
    postSignUp,
    postOtp,
    postResendOtp,
    getLogin,
    postLogin,
    getLogin,
    getForgotPassword,
    sendForgotPasswordOTP,
    verifyForgotPasswordOTP,
    resetPassword,
    postChangePassword,
    getChangePassword,
    getGoogle,
    getGoogleCallback,
    getLogout,
    getabout,
    getContact



};
