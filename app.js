import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import employeeRoutes from './routes/employeeRoutes.js';
import workShiftRoutes from './routes/workShiftRoutes.js';
import designationRoutes from './routes/designationRoutes.js'
import departmentRoutes from "./routes/departmentRoutes.js";
import employmentStatusRoutes from "./routes/employmentStatusRoutes.js";
import leaveRoutes from "./routes/leaveRoutes.js";
import officeLocationRoutes from './routes/officeLocationRoutes.js';
import leavePolicyRoutes from './routes/leavePolicyRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import quickStatsRoutes from './routes/quickStatsRoutes.js';



// Load environment variables
dotenv.config();

const app = express();

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/employees', employeeRoutes);
app.use('/api/workshift', workShiftRoutes);
app.use('/api/designation', designationRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/employment-status", employmentStatusRoutes);
app.use("/api/leaves", leaveRoutes);
app.use('/api/office-locations', officeLocationRoutes)
app.use('/api/leave-policies', leavePolicyRoutes)
app.use('/api/announcements', announcementRoutes)
app.use("/api/events", eventRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/quick-stats", quickStatsRoutes);





// default 
app.get('/', (req, res) => {
  res.send("HRMS_Server is running.............../")
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: err.message
  });
});

// 404 handler - UPDATED FOR EXPRESS 5
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Start listening
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
      console.log(`📊 MongoDB: ${process.env.MONGODB_URI}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
startServer();

export default app;