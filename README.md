# Mr Mohrr7am - IG Math Learning Platform

A professional e-learning website for IG students focusing on mathematics education with an interactive and engaging user interface.

## Features

- Interactive landing page with math-themed animations
- User authentication (register/login)
- Dark mode and light mode toggle
- Responsive design for all devices
- Math-themed visual elements and animations
- User dashboard for tracking progress

## Technologies Used

- **Backend**: Node.js, Express.js
- **Frontend**: EJS, Bootstrap, Font Awesome
- **Database**: MongoDB with Mongoose
- **Authentication**: bcryptjs, express-session
- **Animations**: Lottie

## Project Structure

```
├── app.js                  # Main application entry point
├── config/                 # Configuration files
│   └── db.js               # Database connection
├── controllers/            # Route controllers
│   └── authController.js   # Authentication controller
├── middlewares/            # Custom middlewares
│   └── auth.js             # Authentication middleware
├── models/                 # Database models
│   └── User.js             # User model
├── public/                 # Static assets
│   ├── css/                # CSS files
│   ├── js/                 # JavaScript files
│   ├── images/             # Image files
│   └── animations/         # Animation files
├── routes/                 # Route definitions
│   ├── index.js            # Main routes
│   └── auth.js             # Authentication routes
└── views/                  # EJS templates
    ├── partials/           # Reusable template parts
    │   ├── header.ejs      # Header partial
    │   └── footer.ejs      # Footer partial
    ├── auth/               # Authentication views
    │   ├── login.ejs       # Login page
    │   └── register.ejs    # Registration page
    ├── index.ejs           # Landing page
    ├── dashboard.ejs       # User dashboard
    └── 404.ejs             # 404 error page
```

## Installation

1. Download the project files
```bash
# Extract the project files to your desired location
# Navigate to the project directory
cd ElkablyElearninig
```

2. Install dependencies
```bash
npm install
```

3. Create a .env file in the root directory with the following variables:
```
PORT=3000
SESSION_SECRET=your_session_secret
MONGODB_URI=your_mongodb_connection_string

# Paymob Payment Gateway Configuration
# Old API (for card payments via iframe)
PAYMOB_API_KEY=your_paymob_api_key
PAYMOB_IFRAME_ID=your_paymob_iframe_id
PAYMOB_INTEGRATION_ID_CARD=your_card_integration_id
PAYMOB_INTEGRATION_ID_WALLET=your_wallet_integration_id
PAYMOB_WEBHOOK_SECRET=your_webhook_secret
PAYMOB_BASE_URL=https://accept.paymob.com

# Unified Checkout API (for mobile wallet payments - NEW)
# Required for mobile wallet (Vodafone Cash, Orange Money)
PAYMOB_PUBLIC_KEY=your_paymob_public_key
PAYMOB_SECRET_KEY=your_paymob_secret_key
# Note: The secret key is used as "Token" in Authorization header for unified checkout API
```

4. Run the application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

## Paymob Payment Integration

The application supports two Paymob payment methods:

### 1. Credit/Debit Card Payments (Old API)
- Uses Paymob's iframe-based payment system
- Requires: `PAYMOB_API_KEY`, `PAYMOB_IFRAME_ID`, `PAYMOB_INTEGRATION_ID_CARD`
- Payment is processed in an embedded iframe on the checkout page

### 2. Mobile Wallet Payments (Unified Checkout API - NEW)
- Uses Paymob's new unified checkout API
- Supports: Vodafone Cash, Orange Money
- Requires: `PAYMOB_PUBLIC_KEY`, `PAYMOB_SECRET_KEY`
- Payment redirects to Paymob's unified checkout page
- Payment method ID: `47` (Mobile Wallet)

### How to Get Paymob Credentials

1. **Old API Credentials** (for card payments):
   - Log in to your Paymob Accept Dashboard
   - Navigate to Settings → API Keys to get your `PAYMOB_API_KEY`
   - Go to iFrames tab to get your `PAYMOB_IFRAME_ID`
   - Go to Integration tab to get your `PAYMOB_INTEGRATION_ID_CARD`

2. **Unified Checkout Credentials** (for mobile wallet):
   - Log in to your Paymob Accept Dashboard
   - Navigate to Settings → API Keys
   - Get your `PAYMOB_PUBLIC_KEY` (public key for unified checkout)
   - Get your `PAYMOB_SECRET_KEY` (secret key used as Token in Authorization header)
   - The secret key format should be: `egy_sk_test_...` or `egy_sk_live_...`

### Payment Flow

1. **Card Payment**: User selects card payment → iframe opens → payment processed → webhook callback
2. **Mobile Wallet**: User selects mobile wallet → redirects to unified checkout → payment processed → redirects back to success page

### Webhook Configuration

Configure your Paymob webhook URL to:
- `https://yourdomain.com/purchase/webhook/paymob` (POST)
- `https://yourdomain.com/purchase/webhook` (GET redirect)

The webhook secret should match your `PAYMOB_WEBHOOK_SECRET` environment variable.

## Features to Implement Next

- Course content and lessons
- Interactive quizzes and tests
- Progress tracking system
- Teacher dashboard for content creation
- Discussion forums and community features

## License

ISC

