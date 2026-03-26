import { body, ValidationChain } from 'express-validator';

export const createUserValidator: ValidationChain[] = [
    body('name')
        .notEmpty().withMessage('El nombre es requerido')
        .isLength({ min: 3 }).withMessage('El nombre debe tener al menos 3 caracteres'),
    body('email')
        .isEmail().withMessage('El email no es válido')
];