const express = require('express');
const { createServer } = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

const server = createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*', // Allow all origins, you can restrict this to your Flutter app domain
        methods: ['GET', 'POST'],
        transports: ['websocket', 'polling'],
        credentials: true
    },
    allowEIO3: true
});


const PORT = 3001;
const BASE_URL = 'https://api.leashpets.com/api/leash';

let userSockets = {};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

const handleGetAllChats = async (userToken) => {
    const response = await axios.get(`${BASE_URL}/chat/chats`, {
        headers: {
            "Authorization" : `Bearer ${userToken}`
        }
    });
    if (response?.data?.success) {
        return response?.data?.data;
    }
    else {
        console.log("Nothing Here");
        return [];
    }
}

const handleGetChatsWith = async (chatUUID, userToken) => {
    const response = await axios.get(`${BASE_URL}/chat/${chatUUID}`, {
        headers: {
            "Authorization" : `Bearer ${userToken}`
        }
    });
    if (response?.data) {
        return response?.data?.data;
    }
    else {
        return [];
    }
}

const addChatMessage = async (withUUID, userToken, message, isMedicalPassport, medicalPassportPetUUID) => {
    try {
        const formData = {
            message: message,
            is_medical_passport: isMedicalPassport ? 1 : 0,
            medical_passport_pet_uuid: medicalPassportPetUUID
        };
        const response = await axios.post(`${BASE_URL}/chat/${withUUID}`, formData, {
            headers: {
                "Authorization": `Bearer ${userToken}`,
                "Content-Type": "application/json",
            }
        });

        if (response?.data?.success) {
            console.log("SUCCESS");
            return response?.data?.data;
        } else {
            console.error('Error adding chat message:');
            return [];
        }
    } catch (error) {
        console.error('Error in addChatMessage:', error);
        return [];
    }
}

app.post('/emitMedia', async (req, res) => {
    const { withId, userId, media } = req.body;

    const userSocketId = userSockets[userId];
    const withSocketId = userSockets[withId];

    if (withSocketId) {
        console.log("HERE HERE");
        io.to(withSocketId).emit('privateMessage', { sender: userId, media: media });
    }
    
    return res.json({success: true});
});

io.on('connection', (socket) => {
    console.log('A user connected');

    const userToken = socket.handshake.query.userToken;
    const userUUID = socket.handshake.query.userUUID;

    if (userToken !== undefined) {
        userSockets[userUUID] = {
            socketId: socket.id,
            userToken: userToken
        };
    }

    socket.on('getAllChats', async ({ userUUID }) => {
        const user = userSockets[userUUID];
        const chats = await handleGetAllChats(user?.userToken);
        io.to(user?.socketId).emit('getAllChats', {data: chats});
    });

    socket.on('getChatsWith', async ({ chatUUID, userUUID }) => {
        const user = userSockets[userUUID];
        const chatHistory = await handleGetChatsWith(chatUUID, user?.userToken);
        io.to(user?.socketId).emit('getChatsWith', {data: chatHistory});
    });

    // socket.on('privateMessage', async function ({ userUUID, withUUID, message, isMedicalPassport, medicalPassportPetUUID }) {
    //     const user = userSockets[userUUID];
    //     const withUser = userSockets[withUUID];

    //     var response;

    //     if (isMedicalPassport) {
    //         response = await addChatMessage(withUUID, user?.userToken, message, isMedicalPassport, medicalPassportPetUUID);
    //     }

    //     if (withUser) {
    //         io.to(withUser?.socketId).emit('privateMessage', { sender: userUUID, message: isMedicalPassport ? response?.medical_passport : message, isMedicalPassport: isMedicalPassport });
    //     }

    //     await addChatMessage(withUUID, user?.userToken, message, isMedicalPassport, medicalPassportPetUUID);
        
    //     console.log(`Message sent from ${socket.id} to ${withUser?.socketId}`);
    // });


    socket.on('privateMessage', async function ({ userUUID, withUUID, message, isMedicalPassport, medicalPassportPetUUID }) {
        const user = userSockets[userUUID];
        const withUser = userSockets[withUUID];

        var response;

        if (isMedicalPassport) {
            response = await addChatMessage(withUUID, user?.userToken, message, isMedicalPassport, medicalPassportPetUUID);
            //print response?.medical_passport
            console.log('Response from addChatMessage:', response);
            console.log('Medical Passport:', response?.medical_passport);
        }

        if (withUser) {
            io.to(withUser?.socketId).emit('privateMessage', { sender: userUUID, isMedicalPassport: isMedicalPassport, message: isMedicalPassport ? null : message, medical_passport: isMedicalPassport ? response?.medical_passport : null });
        }

        if(!isMedicalPassport){
            await addChatMessage(withUUID, user?.userToken, message, isMedicalPassport, medicalPassportPetUUID);
        }
        
        console.log(`Message sent from ${socket.id} to ${withUser?.socketId}`);
    });

    
      
    // Listen for chat messages
    socket.on('chat message', async (msg) => {
        console.log('message: ' + msg);

        // Emit the message to all clients
        io.emit('chat message', msg);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
        delete userSockets[userUUID];
    });
});

server.listen(PORT, () => {
    console.log(`Server Running On Port: ${PORT}`);
});