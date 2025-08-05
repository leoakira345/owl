// public/script.js
const authSection = document.getElementById('authSection');
const chatSection = document.getElementById('chatSection');
const showLoginBtn = document.getElementById('showLogin');
const showSignupBtn = document.getElementById('showSignup');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authMessage = document.getElementById('authMessage');

// Login elements
const loginUsernameInput = document.getElementById('loginUsername');
const loginPasswordInput = document.getElementById('loginPassword');

// Signup elements
const signupFullNameInput = document.getElementById('signupFullName');
const signupUsernameInput = document.getElementById('signupUsername');
const signupEmailInput = document.getElementById('signupEmail');
const signupPhoneNumberInput = document.getElementById('signupPhoneNumber');
const signupCountryInput = document.getElementById('signupCountry');
const signupPasswordInput = document.getElementById('signupPassword');

// Chat elements
const currentUsernameDisplay = document.getElementById('currentUsername');
const currentUserIdDisplay = document.getElementById('currentUserId');
const friendSearchInput = document.getElementById('friendSearchInput');
const searchFriendBtn = document.getElementById('searchFriendBtn');
const addFriendBtn = document.getElementById('addFriendBtn');
const friendSearchResult = document.getElementById('friendSearchResult');
const friendsList = document.getElementById('friendsList');
const chatRecipientName = document.getElementById('chatRecipientName');
const messagesDisplay = document.getElementById('messagesDisplay');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const imageUploadInput = document.getElementById('imageUpload');
const voiceRecordBtn = document.getElementById('voiceRecordBtn');
const gifButton = document.getElementById('gifButton');

let currentUser = null;
let activeChatRecipient = null; // Stores the ID of the user currently being chatted with
let socket = null;
let mediaRecorder;
let audioChunks = [];

// --- UI Toggling ---
showLoginBtn.addEventListener('click', () => {
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
    authMessage.textContent = '';
});

showSignupBtn.addEventListener('click', () => {
    signupForm.classList.add('active');
    loginForm.classList.remove('active');
    authMessage.textContent = '';
});

function showAuthMessage(message, type = 'info') {
    authMessage.textContent = message;
    authMessage.className = `message ${type}`;
}

function showChatUI() {
    authSection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    currentUsernameDisplay.textContent = currentUser.username;
    currentUserIdDisplay.textContent = currentUser.id;
    initializeSocket();
    loadFriends();
}

function showLoginUI() {
    authSection.classList.remove('hidden');
    chatSection.classList.add('hidden');
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
    authMessage.textContent = '';
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    if (socket) {
        socket.disconnect();
        socket = null;
    }
}

// --- Authentication ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginUsernameInput.value;
    const password = loginPasswordInput.value;

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            currentUser = data.user;
            showChatUI();
        } else {
            showAuthMessage(data.msg || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAuthMessage('An error occurred during login.', 'error');
    }
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = signupFullNameInput.value;
    const username = signupUsernameInput.value;
    const email = signupEmailInput.value;
    const phoneNumber = signupPhoneNumberInput.value;
    const country = signupCountryInput.value;
    const password = signupPasswordInput.value;

    try {
        const res = await fetch('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, username, email, phoneNumber, country, password })
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            currentUser = data.user;
            showChatUI();
        } else {
            showAuthMessage(data.msg || 'Signup failed', 'error');
        }
    } catch (error) {
        console.error('Signup error:', error);
        showAuthMessage('An error occurred during signup.', 'error');
    }
});

// OAuth buttons (conceptual - would redirect to backend OAuth routes)
document.getElementById('googleLogin').addEventListener('click', () => {
    window.location.href = '/auth/google';
});
document.getElementById('facebookLogin').addEventListener('click', () => {
    window.location.href = '/auth/facebook';
});
document.getElementById('googleSignup').addEventListener('click', () => {
    window.location.href = '/auth/google';
});
document.getElementById('facebookSignup').addEventListener('click', () => {
    window.location.href = '/auth/facebook';
});


// --- Socket.IO Initialization ---
function initializeSocket() {
    if (socket) return; // Already initialized

    socket = io();

    socket.on('connect', () => {
        console.log('Connected to Socket.IO server');
        if (currentUser) {
            socket.emit('userConnected', currentUser.id);
        }
    });

    socket.on('message', (msg) => {
        // Only display message if it's for the current active chat or from the current user
        if (activeChatRecipient && (
            (msg.senderId === activeChatRecipient.id && msg.receiverId === currentUser.id) ||
            (msg.senderId === currentUser.id && msg.receiverId === activeChatRecipient.id)
        )) {
            displayMessage(msg);
        } else if (msg.receiverId === currentUser.id && msg.senderId !== activeChatRecipient?.id) {
            // Notify user of new message from another friend (e.g., highlight friend in list)
            console.log(`New message from ${msg.senderId}`);
            // You'd typically update the UI to show a notification badge on the friend's name
        }
    });

    socket.on('friendRequest', (data) => {
        alert(`New friend request from ${data.requesterUsername}!`);
        loadFriends(); // Reload friends list to show pending requests
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from Socket.IO server');
    });
}

// --- Chat Functionality ---

function displayMessage(msg) {
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble');
    messageBubble.classList.add(msg.isSelf ? 'self' : 'other');

    let contentHTML = '';
    if (msg.type === 'text') {
        contentHTML = `<p>${msg.content}</p>`;
    } else if (msg.type === 'image') {
        contentHTML = `<img src="${msg.fileUrl}" alt="Image">`;
    } else if (msg.type === 'voice') {
        contentHTML = `<audio controls src="${msg.fileUrl}"></audio>`;
    } else if (msg.type === 'gif') {
        contentHTML = `<img src="${msg.fileUrl}" alt="GIF" class="gif-message">`;
    }

    const timestamp = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageBubble.innerHTML = `${contentHTML}<span class="timestamp">${timestamp}</span>`;
    messagesDisplay.appendChild(messageBubble);
    messagesDisplay.scrollTop = messagesDisplay.scrollHeight; // Scroll to bottom
}

sendButton.addEventListener('click', () => {
    sendMessage();
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !activeChatRecipient || !currentUser) return;

    socket.emit('sendMessage', {
        senderId: currentUser.id,
        receiverId: activeChatRecipient.id,
        content: content,
        type: 'text'
    });
    messageInput.value = '';
}

// --- File Upload (Image) ---
imageUploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !activeChatRecipient || !currentUser) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'x-auth-token': token },
            body: formData
        });
        const data = await res.json();

        if (res.ok && data.success) {
            socket.emit('sendMessage', {
                senderId: currentUser.id,
                receiverId: activeChatRecipient.id,
                content: 'Image', // Placeholder content
                type: 'image',
                fileUrl: data.fileUrl
            });
        } else {
            alert('Image upload failed: ' + (data.msg || 'Unknown error'));
        }
    } catch (error) {
        console.error('Image upload error:', error);
        alert('An error occurred during image upload.');
    }
    imageUploadInput.value = ''; // Clear the input
});

// --- Voice Recording ---
voiceRecordBtn.addEventListener('click', async () => {
    if (!mediaRecorder) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            voiceRecordBtn.textContent = 'Stop Recording';
            voiceRecordBtn.classList.add('recording');
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

                const formData = new FormData();
                formData.append('file', audioFile);

                try {
                    const token = localStorage.getItem('token');
                    const res = await fetch('/api/upload', {
                        method: 'POST',
                        headers: { 'x-auth-token': token },
                        body: formData
                    });
                    const data = await res.json();

                    if (res.ok && data.success) {
                        socket.emit('sendMessage', {
                            senderId: currentUser.id,
                            receiverId: activeChatRecipient.id,
                            content: 'Voice Message',
                            type: 'voice',
                            fileUrl: data.fileUrl
                        });
                    } else {
                        alert('Voice upload failed: ' + (data.msg || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Voice upload error:', error);
                    alert('An error occurred during voice upload.');
                }

                voiceRecordBtn.textContent = 'Record Voice';
                voiceRecordBtn.classList.remove('recording');
                mediaRecorder = null;
            };
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Could not access microphone. Please ensure it is connected and permissions are granted.');
        }
    } else {
        mediaRecorder.stop();
    }
});