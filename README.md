# WhatsApp Messenger with AI Integration

A Node.js application that allows you to connect to WhatsApp, send messages to multiple contacts/groups at once, and automatically respond to incoming messages using AI (OpenRouter API).

## Features

- User registration and authentication with email verification
- Connect to WhatsApp using QR code
- Fetch and store contacts and groups from WhatsApp
- Send messages to multiple selected contacts/groups at once
- AI-powered responses to incoming messages using OpenRouter API
- Message history and conversation tracking
- Account management (password reset, account deletion)
- Multi-user support with separate WhatsApp sessions for each user

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: EJS, Bootstrap, jQuery
- **Database**: PostgreSQL
- **WhatsApp Integration**: whatsapp-web.js
- **AI Integration**: OpenRouter API
- **Authentication**: bcrypt, express-session
- **Email**: Nodemailer

## Prerequisites

- Node.js (v16+)
- PostgreSQL database
- Gmail account for sending verification emails (or any other email provider)
- OpenRouter API key for AI responses

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/whatsapp-messenger.git
cd whatsapp-messenger
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Copy the `.env.example` file to `.env` and update the values:

```bash
cp .env.example .env
```

Update the following variables in the `.env` file:

```bash
PORT=3000
NODE_ENV=development

# Database configuration
DATABASE_URL=postgres://username:password@localhost:5432/whatsapp_db

# Session configuration
SESSION_SECRET=your_session_secret_here

# Email configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=your_email@gmail.com

# OpenRouter API configuration
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

4. **Create database tables**

```bash
npm run db:init
```

This will create all necessary tables in your PostgreSQL database.

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The application will be available at `http://localhost:3000`

## Usage

1. **Register and verify account**
   - Create a new account with your email
   - Verify your email using the link sent to your inbox

2. **Connect to WhatsApp**
   - Navigate to "WhatsApp Login" after logging in
   - Scan the QR code with your WhatsApp mobile app

3. **Send messages**
   - Navigate to "Contacts" to see your WhatsApp contacts and groups
   - Go to "Send Message" to select multiple contacts and send a message

4. **Configure AI responses**
   - Navigate to "AI Dashboard" to enable/disable AI features
   - Test AI responses before using with real contacts

## Security Considerations

- The application stores WhatsApp session data securely
- Passwords are hashed using bcrypt
- Email verification prevents unauthorized sign-ups
- Each user's WhatsApp session is isolated

## License

This project is licensed under the ISC License.

## Disclaimer

This application is meant for personal use only. Please ensure you comply with WhatsApp's terms of service when using this application. 