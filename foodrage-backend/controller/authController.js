const userModel = require("../model/userModel.js");
const CustomError = require("../utils/customError.js");
const transporter = require("../config/emailTranspoter.js");
const cookieOptions = require("../utils/cookieOptions.js");
const crypto = require("crypto");

//sign up

const signUp = async (req, res, next) => {
  const data = req.body;
  try {
    const userInfo = new userModel(data);
    const result = await userInfo.save();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
};

//sign in

const signIn = async (req, res, next) => {
  const { password, email } = req.body;
  if (!email || !password) {
    return next(new CustomError("Please fill all fields", 400));
  }

  try {
    const user = await userModel.findOne({ email }).select("+password");
    if (!user) {
      return next(new CustomError("you are not registered", 400));
    }

    const isPasswordMatched = await user.comparePassword(password);
    if (isPasswordMatched) {
      const token = user.getJwtToken();
      user.password = undefined;
      res.cookie("Token", token, cookieOptions);
      return res.status(200).json({
        success: true,
        token: token,
        data: user
      });
    } else {
      return next(
        new CustomError("Invalid credentials - incorrect password", 400)
      );
    }
  } catch (error) {
    return next(error);
  }
};

//logout

const logout = async (req, res, next) => {
  try {
    res.cookie("Token", null, {
      expires: new Date(Date.now()),
      httpOnly: true
    });
    res.status(200).json({
      success: true,
      message: "Logged Out"
    });
  } catch (error) {
    next(error);
  }
};

//forgot password

const forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(CustomError("Email is required", 400));
  try {
    const user = await userModel.findOne({ email });
    if (!user) {
      return next(new CustomError("User not found", 404));
    }
    const resetToken = user.generateForgotPasswordToken();
    await user.save();

    const resetUrl = `${req.headers.referer}reset_password/${resetToken}`;

    // create mail content
    const mailOptions = {
      from: process.env.EMAIL_ID,
      to: user.email,
      subject: "Event managment Reset password",
      html: `<b>Hello ${user.name}</b><br>
           <a href="${resetUrl}" target ="_blank" >Click here to reset password</a>`
    };

    // send email
    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        user.forgotPasswordToken = undefined;
        user.forgotPasswordExpiry = undefined;
        await user.save();
        return next(error);
      }
      return res.status(200).json({
        success: true,
        message: "Furthre instrunctions sent on you email " + email
      });
    });
  } catch (error) {
    return next(error);
  }
};

//reset password

const resetPassword = async (req, res, next) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  try {
    if (!password || !confirmPassword) {
      return next(
        new CustomError("password and conform Password is Required", 400)
      );
    }

    if (password !== confirmPassword) {
      return next(
        new CustomError("password and confirm password does not match", 400)
      );
    }

    // check user is exist
    const user = await userModel.findOne({
      forgotPasswordToken: resetPasswordToken,
      forgotPasswordExpiry: { $gt: new Date(Date.now()) }
    });
    if (!user) {
      return next(
        new CustomError("forgot password token is invalid or expired", 400)
      );
    }

    user.password = password;
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    await user.save();

    // create jwt token and send  to client,
    const token = user.getJwtToken();
    res.status(200).cookie("Token", token, cookieOptions).json({
      success: true,
      message: "successfuly updated the password",
      Token: token
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  signUp,
  signIn,
  logout,
  forgotPassword,
  resetPassword
};
