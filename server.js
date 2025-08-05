// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer'); // For file uploads
const path = require('path');
const { connectDB, User, Message, Friendship } = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Connect to Database
connectDB();

// Middleware
app.use(express.json()); // For parsing JSON request bodies
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files (HTML, CSS, JS)

// --- File Upload Setup (Multer) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/'); // Files will be saved in public/uploads/
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Ensure uploads directory exists
// IMPORTANT: On platforms like Render, the application's deployed directory
// is often read-only. Attempting to create directories here will fail.
// For persistent file storage on Render, consider using a Persistent Disk
// or an external cloud storage service (e.g., AWS S3, Cloudinary).
// The following block has been removed to fix the deployment error.
// const uploadsDir = path.join(__dirname, 'public/uploads');
// if (!require('fs').existsSync(uploadsDir)) {
//     require('fs').mkdirSync(uploadsDir);
// }

// --- JWT Authentication Middleware ---
const auth = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

// --- API Routes ---

// @route   POST /api/signup
// @desc    Register user
app.post('/api/signup', async (req, res) => {
    const { fullName, username, email, phoneNumber, country, password } = req.body;

    try {
        let user = await User.findOne({ $or: [{ email }, { username }] });
        if (user) {
            return res.status(400).json({ msg: 'User with that email or username already exists' });
        }

        // Generate a simple unique ID (for demonstration, use a more robust method in production)
        const id = Math.random().toString(36).substring(2, 10).toUpperCase();

        user = new User({
            id, // Assign the generated ID
            fullName,
            username,
            email,
            phoneNumber,
            country,
            password
        });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);

        await user.save();

        const payload = { user: { id: user.id, _id: user._id } }; // Use both custom ID and MongoDB _id

        jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ msg: 'Account created successfully!', token, user: { id: user.id, username: user.username, fullName: user.fullName } });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// @route   POST /api/login
// @desc    Authenticate user & get token
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        let user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid Credentials' });
        }

        const payload = { user: { id: user.id, _id: user._id } };

        jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' }, (err, token) => {
            if (err) throw err;
            res.json({ msg: 'Logged in successfully!', token, user: { id: user.id, username: user.username, fullName: user.fullName } });
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
});

// --- OAuth (Google/Facebook) - Conceptual ---
// Full OAuth implementation requires setting up Google/Facebook Developer Consoles,
// obtaining client IDs/secrets, and using libraries like 'passport' or 'passport-google-oauth20'.
// This is a placeholder to show where it would fit.
app.get('/auth/google', (req, res) => {
    // Redirect to Google's OAuth consent screen
    res.redirect('https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_GOOGLE_CLIENT_ID&redirect_uri=http://localhost:3000/auth/google/callback&response_type=code&scope=profile email');
});

app.get('/auth/google/callback', async (req, res) => {
    // Handle callback from Google, exchange code for token, get user profile
    // Create/login user in your DB, generate JWT, redirect to chat page
    res.send('Google OAuth callback - Not fully implemented');
});

app.get('/auth/facebook', (req, res) => {
    // Redirect to Facebook's OAuth consent screen
    res.redirect('https://www.facebook.com/v12.0/dialog/oauth?client_id=YOUR_FACEBOOK_APP_ID&redirect_uri=http://localhost:3000/auth/facebook/callback&scope=email,public_profile');
});

app.get('/auth/facebook/callback', async (req, res) => {
    // Handle callback from Facebook, exchange code for token, get user profile
    // Create/login user in your DB, generate JWT, redirect to chat page
    res.send('Facebook OAuth callback - Not fully implemented');
});


// --- Socket.IO Real-time Communication ---

// Store active users and their socket IDs
const activeUsers = new Map(); // Map: userId -> socketId

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // When a user logs in and sends their user ID
    socket.on('userConnected', async (userId) => {
        activeUsers.set(userId, socket.id);
        console.log(`User ${userId} connected with socket ID ${socket.id}`);
        // Optionally, emit online status to friends
    });

    // Handle sending messages
    socket.on('sendMessage', async (data) => {
        const { senderId, receiverId, content, type = 'text', fileUrl = null } = data;

        try {
            const sender = await User.findOne({ id: senderId });
            const receiver = await User.findOne({ id: receiverId });

            if (!sender || !receiver) {
                console.error('Sender or receiver not found');
                return;
            }

            const newMessage = new Message({
                sender: sender._id,
                receiver: receiver._id,
                content,
                type,
                fileUrl
            });
            await newMessage.save();

            // Emit message to sender (for self-update)
            socket.emit('message', {
                senderId: sender.id,
                receiverId: receiver.id,
                content,
                type,
                fileUrl,
                timestamp: newMessage.timestamp,
                isSelf: true // Indicate it's a message sent by self
            });

            // Emit message to receiver if they are online
            const receiverSocketId = activeUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('message', {
                    senderId: sender.id,
                    receiverId: receiver.id,
                    content,
                    type,
                    fileUrl,
                    timestamp: newMessage.timestamp,
                    isSelf: false // Indicate it's a message from another user
                });
            } else {
                console.log(`User ${receiverId} is offline. Message stored.`);
                // Implement push notifications here for offline users
            }
        } catch (error) {
            console.error('Error sending message:', error);
        }
    });

    // Handle searching for users by ID
    socket.on('searchUser', async (searchId, callback) => {
        try {
            const user = await User.findOne({ id: searchId }).select('id username fullName');
            if (user) {
                callback({ success: true, user });
            } else {
                callback({ success: false, msg: 'User not found.' });
            }
        } catch (error) {
            console.error('Error searching user:', error);
            callback({ success: false, msg: 'Server error during search.' });
        }
    });

    // Handle adding friends
    socket.on('addFriend', async (data, callback) => {
        const { requesterId, recipientId } = data;
        try {
            const requester = await User.findOne({ id: requesterId });
            const recipient = await User.findOne({ id: recipientId });

            if (!requester || !recipient) {
                return callback({ success: false, msg: 'User not found.' });
            }

            // Check if friendship already exists or is pending
            let friendship = await Friendship.findOne({
                $or: [
                    { requester: requester._id, recipient: recipient._id },
                    { requester: recipient._id, recipient: requester._id }
                ]
            });

            if (friendship) {
                if (friendship.status === 'accepted') {
                    return callback({ success: false, msg: 'Already friends.' });
                } else if (friendship.status === 'pending') {
                    return callback({ success: false, msg: 'Friend request already sent or received.' });
                }
            }

            // Create new friendship request
            friendship = new Friendship({
                requester: requester._id,
                recipient: recipient._id,
                status: 'pending'
            });
            await friendship.save();

            // Notify recipient
            const recipientSocketId = activeUsers.get(recipientId);
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('friendRequest', {
                    requesterId: requester.id,
                    requesterUsername: requester.username,
                    msg: `${requester.username} sent you a friend request.`
                });
            }

            callback({ success: true, msg: 'Friend request sent!' });

        } catch (error) {
            console.error('Error adding friend:', error);
            callback({ success: false, msg: 'Server error during friend request.' });
        }
    });

    // Handle accepting/rejecting friend requests (add more routes/events for this)
    // For brevity, not fully implemented here.

    // Get user's friends
    socket.on('getFriends', async (userId, callback) => {
        try {
            const user = await User.findOne({ id: userId });
            if (!user) return callback({ success: false, msg: 'User not found.' });

            const friends = await Friendship.find({
                $or: [{ requester: user._id, status: 'accepted' }, { recipient: user._id, status: 'accepted' }]
            })
            .populate('requester', 'id username fullName')
            .populate('recipient', 'id username fullName');

            const friendList = friends.map(f => {
                const friendUser = f.requester._id.equals(user._id) ? f.recipient : f.requester;
                return { id: friendUser.id, username: friendUser.username, fullName: friendUser.fullName };
            });

            callback({ success: true, friends: friendList });
        } catch (error) {
            console.error('Error getting friends:', error);
            callback({ success: false, msg: 'Server error getting friends.' });
        }
    });

    // Get chat history between two users
    socket.on('getChatHistory', async (data, callback) => {
        const { user1Id, user2Id } = data;
        try {
            const user1 = await User.findOne({ id: user1Id });
            const user2 = await User.findOne({ id: user2Id });

            if (!user1 || !user2) {
                return callback({ success: false, msg: 'One or both users not found.' });
            }

            const messages = await Message.find({
                $or: [
                    { sender: user1._id, receiver: user2._id },
                    { sender: user2._id, receiver: user1._id }
                ]
            })
            .sort('timestamp')
            .populate('sender', 'id username')
            .populate('receiver', 'id username');

            const formattedMessages = messages.map(msg => ({
                senderId: msg.sender.id,
                receiverId: msg.receiver.id,
                content: msg.content,
                type: msg.type,
                fileUrl: msg.fileUrl,
                timestamp: msg.timestamp,
                isSelf: msg.sender.id === user1Id // Determine if message was sent by the current user
            }));

            callback({ success: true, messages: formattedMessages });

        } catch (error) {
            console.error('Error getting chat history:', error);
            callback({ success: false, msg: 'Server error getting chat history.' });
        }
    });


    // Handle file uploads (images, voice notes)
    // This is an HTTP POST route, not a Socket.IO event, as file uploads are typically handled via HTTP.
    app.post('/api/upload', auth, upload.single('file'), (req, res) => {
        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded.' });
        }
        // The file is uploaded to public/uploads/
        // IMPORTANT: On platforms like Render, files uploaded this way will NOT persist
        // across restarts or deploys, as the file system for the application code is ephemeral.
        // For persistent storage, use a Persistent Disk or an external cloud storage service.
        const fileUrl = `/uploads/${req.file.filename}`; // URL to access the file from frontend
        res.json({ success: true, fileUrl, msg: 'File uploaded successfully.' });
    });

    // Handle GIF sending (conceptual - would integrate with a GIF API like Giphy)
    // The client would fetch GIFs from Giphy, and then send the GIF's URL via sendMessage.
    // No specific server-side route needed for GIF search, just for sending the URL.

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Remove user from activeUsers map
        for (let [userId, socketId] of activeUsers.entries()) {
            if (socketId === socket.id) {
                activeUsers.delete(userId);
                console.log(`User ${userId} removed from active users.`);
                break;
            }
        }
    });
});

// Start the server
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));