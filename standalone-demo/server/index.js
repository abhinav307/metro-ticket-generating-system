import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { config } from './config.js';
import { initDb } from './db/index.js';
import { seedDatabase } from './db/seed.js';
import { sessionMiddleware } from './middleware/session.js';
import { errorHandler } from './middleware/errorHandler.js';

import healthRouter from './routes/health.js';
import stationsRouter from './routes/stations.js';
import routesRouter from './routes/routes.js';
import fareRouter from './routes/fare.js';
import bookingsRouter from './routes/bookings.js';
import scannerRouter from './routes/scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Security and CORS configuration
app.use(cors({
  origin: config.corsOrigin,
  exposedHeaders: ['X-Demo-Session-ID']
}));

// Body parsing
app.use(express.json());

// Demo session isolation middleware
app.use(sessionMiddleware);

// API Route Mounts
app.use('/api/health', healthRouter);
app.use('/api/stations', stationsRouter);
app.use('/api/routes', routesRouter);
app.use('/api/fare', fareRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/scanner', scannerRouter);

// Serve frontend static build in production or when dist/ exists
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  console.log(`[Static] Serving compiled UI assets from: ${distPath}`);
  app.use(express.static(distPath));

  // SPA client-side routing fallback (Express 5 compatible)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

// Global error handler
app.use(errorHandler);

// Server startup routine
export async function startServer(port = config.port) {
  try {
    console.log('[Startup] Initializing MTTS Full-Stack Demo backend...');
    await initDb();
    await seedDatabase();

    const server = app.listen(port, () => {
      console.log(`====================================================`);
      console.log(` Metro Ticket Generating System (MTTS) Full-Stack Demo`);
      console.log(` Scope: x_mtts | Port: ${port} | Node: ${process.version}`);
      console.log(` Health Endpoint: http://localhost:${port}/api/health`);
      console.log(`====================================================`);
    });

    return server;
  } catch (err) {
    console.error('[Startup Fatal Error]', err);
    throw err;
  }
}

// Self-execute if run directly
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('index.js') || 
  process.argv[1].endsWith('server')
);

if (isDirectExecution && process.env.NODE_ENV !== 'test') {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
