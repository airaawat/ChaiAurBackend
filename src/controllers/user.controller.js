const asyncHandler = require('../utils/asyncHandler');
const apiError = require('../utils/apiError');
const User = require('../models/user.model');
const uploadOnCloudinary = require('../utils/cloudinary');
const apiResponse = require('../utils/apiResponse');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const generateAccessTokenAndRefreshToken = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});

        return {accessToken, refreshToken};
    } catch (error) {
        throw new apiError(500, "Something went wrong while generating access token and refresh token");
    }
}

const registerUser = asyncHandler(async (req, res) => {
    const {fullname, username, email, password} = req.body;

    if(
        [fullname, username, email, password].some((field) => field?.trim() === "")
    ){
        throw new apiError(400, "All fields are required");
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    });

    if(existedUser){
        throw new apiError(409, "User with email or username already exists");
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    console.log(avatarLocalPath);
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path;
    }

    if(!avatarLocalPath){
        throw new apiError(400, "Avatar file is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    console.log(avatar)
    if(!avatar){
        throw new apiError(400, "Avatar file is required");
    }

    const user = await User.create({
        fullname, 
        avatar: avatar.url,
        coverImage: coverImage?.url || "", 
        username: username.toLowerCase(), 
        email, 
        password, 
    });

    const createdUser = await User.findById(user._id).select("-password -refereshToken");

    if(!createdUser){
        throw new apiError(500, "Something went wrong while registering user");
    }

    return res.status(201).json(
      new apiResponse(200, createdUser, "User created successfully")
    );
});

const loginUser = asyncHandler(async(req, res) => {
    const {email, username, password} = req.body
    console.log(email);

    if(!(username || email)){
        throw new apiError(400, "Usrname or email is required");
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new apiError(404, "User does not exist");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if(!isPasswordValid){
        throw new apiError(401, "Invalid user credentials");
    }

    const {accessToken, refreshToken} = await generateAccessTokenAndRefreshToken(user._id);

    const loggedInUser = await user.findById(user._id).select("-password -refreshToken");

    const options = {
        httpsOnly: true, 
        secure: true
    };

    return res.status(200)
              .cookie("accessToken", accessToken, options)
              .cookie("refreshToken", refreshToken, options)
              .json(
                new apiResponse(
                    200, 
                    {
                        user: loggedInUser, accessToken, refreshToken
                    },
                    "User logged in successfully"
                ),
              )
});

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id, 
        {
            $unset: {
                refreshToken: 1 //removes field from the document
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpsOnly: true, 
        secure: true
    };

    return res.status(200)
              .clearCookie("accessToken", options)
              .clearCookie("refreshToken", options)
              .json(new apiResponse(200, {}, "User logged out"));
});

const refreshAccessToken = asyncHandler(async(req, res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new apiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

        const user = await User.findById(decodedToken?._id);

        if(!user){
            throw new apiError(401, "invalid refresh token")
        }

        if(incomingRefreshToken !== user?.refreshToken){
            throw new apiError(401, "Refresh token expired or used")
        }

        const options = {
            httpsOnly: true,
            secure: true
        }

        const {accessToken, newRefreshToken} = generateAccessTokenAndRefreshToken(user._id);

        return res.status(200)
                  .cookie("accessToken", accessToken, options)
                  .cookie("RefreshToken", newRefreshToken, options)
                  .json(
                    new apiResponse(200, {accessToken, refreshToken: newRefreshToken},
                        "Access token refreshed")
                  )
    } catch (error) {
        throw new apiError(401, error?.message || "Invalid refresh token")
    }
});

const changeCurrentPassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body;

    const user = await User.findById(req.user?._id);

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new apiError(400, "Invalid old password");
    }

    user.password = newPassword;
    await user.save({validateBeforeSave: true});

    return res.status(200)
              .json(new apiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async(req, res) => {
    return res.status(200)
              .json(new apiResponse(200, req.user, "User fetched successfully"))
});

const updateAccountDetails = asyncHandler(async(req, res) => {
    const {fullName, email} = req.body;

    if(!fullName || !email){
        throw new apiError(400, "All fields are required");
    }

    const user = await user.findByIdAndUpdate(req.user._id, 
        {
            $set: {
                fullName,
                email
            }
        },
        {new: true}
        ).select("-password");

        return res.status(200)
                  .json(new apiResponse(200, user, "Account details updated successfully"));
});

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path;

    if(!avatarLocalPath){
        throw new apiError(400, "Avatar file is missing");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if(!avatar.url){
        throw new apiError(400, "error while uploading on cloud");
    }

    const user = await User.findByIdAndUpdate(req.user?._id, 
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}).select("-password");

    return res.status(200)
              .json(new apiResponse(200, user, "Avatar image updated successfully"))
});

const updatedCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path;

    if(!coverImageLocalPath){
        throw new apiError(400, "cover image file is missing");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);
    
    if(!coverImage.url){
        throw new apiError(400, "error while uploading on cloud");
    } 

    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}).select("-password");

    return res.status(200)
              .json(new apiResponse(200, user, "cover image uploaded successfully"));
});



module.exports = {registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updatedCoverImage};