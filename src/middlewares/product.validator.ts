import { body, ValidationChain } from 'express-validator';

export const createProductValidator: ValidationChain[] = [
    body('name').notEmpty().withMessage('El nombre del producto es obligatorio'),
    body('price').isNumeric().withMessage('El precio debe ser un número')
                 .isFloat({ min: 0 }).withMessage('El precio debe ser un número positivo')
    ];