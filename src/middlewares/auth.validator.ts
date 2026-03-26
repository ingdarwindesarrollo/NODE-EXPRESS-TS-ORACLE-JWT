import { body, ValidationChain } from 'express-validator';

export const registerValidator: ValidationChain[] = [
    body('name')
        .notEmpty().withMessage('El nombre es requerido')
        .isLength({ min: 3 }).withMessage('Mínimo 3 caracteres'),
    body('email')
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
        .matches(/[A-Z]/).withMessage('Debe contener al menos una mayúscula')
        .matches(/[0-9]/).withMessage('Debe contener al menos un número'),
];

export const loginValidator: ValidationChain[] = [
    body('email')
        .isEmail().withMessage('Email inválido')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('La contraseña es requerida'),
];
