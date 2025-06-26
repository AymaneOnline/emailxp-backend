// emailxp/backend/server.js

const express = require('express');
const dotenv = require('dotenv').config();
const cors = require('cors');
const { errorHandler } = require('./middleware/errorMiddleware');
const connectDB = require('./config/db');
require('./config/cloudinary');

const userRoutes = require('./routes/userRoutes');
const campaignRoutes = require('./routes/campaignRoutes'); // This is line 11
const listRoutes = require('./routes/listRoutes');
const subscriberRoutes = require('./routes/subscriberRoutes');
const templateRoutes = require('./routes/templateRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Define API routes
app.use('/api/users', userRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/upload', uploadRoutes);

// NEW: Simple status endpoint for frontend checks
app.get('/api/status', (req, res) => {
    res.status(200).json({ message: 'Backend API is running!' });
});

// Serve frontend (if applicable, for Railway this is usually separate)
if (process.env.NODE_ENV === 'production') {
    // ...
} else {
    // This is only for local dev if you run backend on root
    app.get('/', (req, res) => res.status(200).json({ message: 'Welcome to the EmailXP Backend API' }));
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));