import { Router } from 'express';
import * as c from '../controllers/auth.controllers';
import validate from '../middlewares/validate';
import { registerValidator, loginValidator } from '../middlewares/auth.validator';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

// POST /api/auth/register
router.post('/register', registerValidator, validate, c.register);

// POST /api/auth/login
router.post('/login', loginValidator, validate, c.login);

// POST /api/auth/logout  (requiere estar autenticado)
router.post('/logout', protect, c.logout);

// GET /api/auth/me  (ruta protegida: devuelve el usuario del token)
router.get('/me', protect, c.me);

export default router;
