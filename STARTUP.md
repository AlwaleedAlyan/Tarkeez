# Tarkeez Local Startup Guide

Follow these steps to get the Tarkeez monorepo running locally on your machine.

## 1. Install Dependencies

This project strictly enforces the use of **pnpm**.

```bash
# Install pnpm globally if you don't have it
npm install -g pnpm

# Install project dependencies
pnpm install
```

## 2. Set Up the Database

The API server requires a PostgreSQL database. The easiest way to spin one up is using Docker.

```bash
# Define your database credentials. You can change these values.
export DB_USER="postgres"
export DB_PASSWORD="mysecretpassword"
export DB_NAME="tarkeez"
export DB_PORT="5432"

# Start a local Postgres container.
# If a container named "tarkeez-db" already exists, you may need to remove it first (`docker rm -f tarkeez-db`)
# or use a different name.
docker run --name tarkeez-db -e POSTGRES_USER=$DB_USER -e POSTGRES_PASSWORD=$DB_PASSWORD -e POSTGRES_DB=$DB_NAME -p $DB_PORT:5432 -d postgres

# Export the connection string to your environment
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:$DB_PORT/$DB_NAME"

# Push the database schema using Drizzle
pnpm --filter @workspace/db run push
```

## 3. Run the API Server

The API server needs the `PORT` and `DATABASE_URL` environment variables to be set.

```bash
# Export the port you want the server to run on (if not already set in package.json)
export PORT=3000

# Start the API server
pnpm --filter @workspace/api-server run dev
```

## 4. Run the Expo Mobile App

To test the app on a physical device, it needs to connect to your computer's local IP address instead of `localhost`. Open a **new terminal window** to keep the API server running in the background.

```bash
# 1. Find your Mac's local network IP address (usually looks like 192.168.1.x)
ipconfig getifaddr en0 

# 2. Export the API URL using your IP address
export EXPO_PUBLIC_API_URL="http://<YOUR_LOCAL_IP>:3000"

# 3. Navigate to the mobile app directory and start the Expo development server
cd artifacts/tarkeez
pnpm run start
```

Finally, scan the QR code in your terminal using the **Expo Go** app on your iPhone or Android device!