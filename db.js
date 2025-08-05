// db.js
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

// --- Connect to MongoDB ---
const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            // useCreateIndex: true, // Deprecated in Mongoose 6+
            // useFindAndModify: false // Deprecated in Mongoose 6+
        });
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1); // Exit process with failure
    }
};

// --- User Schema ---
const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true }, // Unique ID for searching
    fullName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phoneNumber: { type: String },
    country: { type: String },
    password: { type: String, required: true }, // Hashed password
    googleId: { type: String }, // For Google OAuth
    facebookId: { type: String }, // For Facebook OAuth
    createdAt: { type: Date, default: Date.now }
});

// --- Message Schema ---
const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String }, // Text message
    type: {
        type: String,
        enum: ['text', 'image', 'voice', 'gif'],
        default: 'text'
    },
    fileUrl: { type: String }, // URL for image, voice, or GIF
    timestamp: { type: Date, default: Date.now }
});

// --- Friendship Schema ---
const FriendshipSchema = new mongoose.Schema({
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'blocked'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Friendship = mongoose.model('Friendship', FriendshipSchema);

module.exports = { connectDB, User, Message, Friendship };