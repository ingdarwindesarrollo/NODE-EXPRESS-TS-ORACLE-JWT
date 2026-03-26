import dotenv from 'dotenv';
dotenv.config();   // MUST be first — loads .env before any process.env read

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { initDB } from './config/db';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import productRoutes from './routes/product.routes';
import errorHandler from './middlewares/error.middleware';

const app = express();

// CORS: credentials:true es obligatorio para que el navegador envíe cookies
app.use(cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
}));
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
initDB();

app.listen(3000, () => {
    console.log('Servidor en http://localhost:3000');
});

app.use(errorHandler);
