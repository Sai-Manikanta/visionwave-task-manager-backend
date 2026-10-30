import mongoose from 'mongoose';
import { createApp } from './app.js';
import { env } from './config/env.js';

async function start() {
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 15000 });
  console.log(`Connected to MongoDB database "${mongoose.connection.name}"`);
  createApp().listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start the server:', err.message);
  process.exit(1);
});
