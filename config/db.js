const mongoose = require('mongoose');

const MONGO_OPTIONS = {
  maxPoolSize: 3,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let clientPromise = null;

function connectDB() {
  if (clientPromise) return clientPromise;

  const uri = process.env.DATABASE_URL;
  if (!uri) {
    console.error('FATAL: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  clientPromise = mongoose.connect(uri, MONGO_OPTIONS).then(() => {
    console.log('MongoDB connected successfully');
    return mongoose.connection.getClient();
  });

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  return clientPromise;
}

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

module.exports = { connectDB };
