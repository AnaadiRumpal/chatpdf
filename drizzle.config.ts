import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from the .env file
dotenv.config();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL!, // Use the DATABASE_URL from the .env file
  },
});
