// scripts/initializeEmpllyeeIdCounter.js
import mongoose from "mongoose";
import { Counter } from "../models/Counter.js";
import dotenv from "dotenv";
import Employee from "../models/Employee.js";
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const empCount = await Employee.countDocuments();
  await Counter.findOneAndUpdate(
    { name: "employeeId" },
    { $set: { value: empCount } },
    { upsert: true, new: true }
  );
  console.log(`Counter for adId initialized to ${empCount}`);
  mongoose.disconnect();
}

main().catch(console.error);
