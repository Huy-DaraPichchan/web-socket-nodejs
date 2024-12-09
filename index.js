import express from 'express'
import { Server } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'

//this is done because we use type module in node instead of commonjs (__dirname is not defined in es module)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


const PORT = process.env.PORT || 3500
const ADMIN = "Admin"

const app = express()

//define static folder
app.use(express.static(path.join(__dirname, "public")))

const expressServer = app.listen(PORT, () => {
    console.log(`listening on port ${PORT}`)
})

const UsersState = {
    users: [],
    setUsers: function (newUsersArray) {
        this.users = newUsersArray
    }
}

const io = new Server(expressServer, {
    //if the backend is hosted on a different domain, you would need to give your frontend domain access as well
    //cross origin resource sharing - CORS
    cors: {
        origin: process.env.NODE_ENV === "production" ? false : ["http://localhost:5500", "http://127.0.0.1:5500"]
    }
})

io.on('connection', socket => {
    console.log(`User ${socket.id} connected`)

    // Upon connection - only to user
    socket.emit('message', buildMsg(ADMIN, "Welcome to Chat App!"))

    socket.on('enterRoom', ({ name, room }) => {
        //Leave previous room 

        const prevRoom = getUser(socket.id)?.room

        if (prevRoom) {
            socket.leave(prevRoom)
            //to or in is like a way to select room in socket.io: in/to that prevRoom, emit something
            io.to(prevRoom).emit('message', buildMsg(ADMIN, `${name} has left the room`))
        }

        const user = activateUser(socket.id, name, room)

        // Cannot update previous room users list until after the sate update in activate user

        if (prevRoom) {
            io.to(prevRoom).emit('userList', {
                users: getUsersInRoom(prevRoom)
            })
        }

        socket.join(user.room)

        // To user who joined
        socket.emit('message', buildMsg(ADMIN, `You have joined the ${user.room} chat room`))

        // To everyone else
        socket.broadcast.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} have joined the room`))

        // Update user list for room
        io.to(user.room).emit('userList', {
            users: getUsersInRoom(user.room)
        })

        // Update rooms list for everyone
        io.emit('roomList', {
            rooms: getAllActiveRooms()
        })
    })

    // Upon disconnection - to all others
    socket.on('disconnect', () => {
        const user = getUser(socket.id)
        userLeaveApp(socket.id)

        if (user) {
            io.to(user.room).emit('message', buildMsg(ADMIN, `${user.name} has left the room`))
            io.to(user.room).emit('userList', {
                users: getUsersInRoom(user.room)
            })

            io.emit('roomList', {
                rooms: getAllActiveRooms()
            })
        }

        console.log(`User ${socket.id} disconnected`)

    })


    // Listening for a message event
    socket.on('message', ({ name, text }) => {
        const room = getUser(socket.id)?.room
        if (room) {
            io.to(room).emit('message', buildMsg(name, text))
        }
    })



    // Listening for activity
    socket.on('activity', (name) => {
        const room = getUser(socket.id)?.room

        if (room) {
            socket.broadcast.to(room).emit('activity', name)
        }
    })
})

function buildMsg(name, text) {
    return {
        name,
        text,
        time: new Intl.DateTimeFormat('default', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
        }).format(new Date())
    }
}


// User functions
function activateUser(id, name, room) {
    const user = { id, name, room }
    UsersState.setUsers([
        ...UsersState.users.filter(user => user.id !== id),
        user
    ])
    return user
}

function userLeaveApp(id) {
    UsersState.setUsers(
        UsersState.users.filter(user => user.id !== id)
    )
}

function getUser(id) {
    return UsersState.users.find(user => user.id === id)
}

function getUsersInRoom(room) {
    return UsersState.users.filter(user => user.room === room)
}

function getAllActiveRooms() {
    return Array.from(new Set(UsersState.users.map(user => user.room)))
}

