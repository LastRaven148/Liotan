# Liotan

Full-stack real-time messenger built with React, Node.js, MongoDB and Socket.IO.

## Features

* JWT authentication
* Real-time messaging
* Online status
* Dialog list
* Unread messages
* User profiles
* Avatar upload
* User bio
* Telegram-inspired interface
* Electron desktop build

## Tech Stack

Frontend:

* React
* Socket.IO Client
* CSS

Backend:

* Node.js
* Express
* Socket.IO
* MongoDB
* Mongoose
* JWT
* Multer

Desktop:

* Electron

## Installation

Clone repository:

```bash
git clone <repository-url>
cd RavensNest
```

Install dependencies:

```bash
npm install

cd client
npm install

cd ../server
npm install
```

Create environment file:

```bash
cp .env.example .env
```

Example:

```env
PORT=3001
MONGO_URI=mongodb://127.0.0.1:27017/liotan
JWT_SECRET=your_secret
```

## Run Development

From project root:

```bash
npm run dev
```

## Project Structure

```text
client/
server/

server/
  routes/
  sockets/
  middleware/
  config/
  models/
  utils/
```

## Status

Current version:

* Authentication
* Messaging
* Profiles
* Dialog system
* Electron support

Project is under active development.
