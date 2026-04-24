# Quiz Arena Backend

This repository contains the backend API for the Arena Quiz App, built with Express.js and MongoDB.

## Features

- User authentication and management
- Quiz creation, editing, and deletion
- Question and answer management
- Real-time score tracking
- RESTful API endpoints

## Tech Stack

- Node.js
- Express.js
- MongoDB (Mongoose)
- JWT for authentication

## Getting Started

### Prerequisites

- Node.js & npm
- MongoDB

### Installation

```bash
git clone https://github.com/yourusername/quiz-arena-backend.git
cd quiz-arena-backend
npm install
```

### Configuration

1. Copy the environment variables file:

```bash
cp .env.example .env
```

2. Update the `.env` file with your actual values:

- Set `MONGODB_URI` to your MongoDB connection string
- Generate secure JWT secrets for `JWT_SECRET` and `JWT_SECRET_DASHBOARD`
- Configure SMTP settings for email functionality
- Adjust other variables as needed

### Running the Server

For development:

```bash
npm run dev
```

For production:

```bash
npm start
```

The server will start on the port specified in your `.env` file (default: 5000).

## Contributing

Pull requests are welcome. For major changes, please open an issue first.
