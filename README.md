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
```

4. Run the application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

5. Open your browser and navigate to `http://localhost:3000`

## Features to Implement Next

- Course content and lessons
- Interactive quizzes and tests
- Progress tracking system
- Teacher dashboard for content creation
- Discussion forums and community features

## License

ISC

